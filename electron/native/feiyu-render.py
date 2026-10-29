"""Persistent Feiyu CosyVoice3 adapter; synthesizes WAV without playback."""
import argparse
import contextlib
import json
from pathlib import Path
import sys
import traceback

protocol = sys.stdout
def emit(event, **values):
    protocol.write(json.dumps(dict(event=event, **values), ensure_ascii=True) + '\n')
    protocol.flush()

p = argparse.ArgumentParser()
p.add_argument('--runtime-root', type=Path, required=True)
p.add_argument('--voice-dir', default='feiyu')
options = p.parse_args()
root = options.runtime_root.resolve()
state = None
for line in sys.stdin:
    request_id = None
    try:
        request = json.loads(line)
        request_id = request['id']
        text = request['text']
        rate = float(request.get('rate', 1))
        if not isinstance(text, str) or not text.strip() or len(text)>2000 or not .5<=rate<=2:
            raise ValueError('Invalid text or speech rate')
        output = Path(request['outputFile']).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        with contextlib.redirect_stdout(sys.stderr):
            if state is None:
                script = root / 'tools/benchmark-feiyu.py'
                source = script.read_text(encoding='utf-8-sig').replace("out=ROOT/'output/feiyu-test'", 'out=Path('+repr(str(output.parent))+')')
                sys.argv = [str(script), '--backend', 'flow-directml', '--runs', '0', '--threads', '4']
                state = {'__file__': str(script), '__name__': 'studio_feiyu_worker'}
                exec(compile(source, str(script), 'exec'), state)
                profile = json.loads((root/'voices'/options.voice_dir/'voice.json').read_text(encoding='utf-8-sig'))
                voice = state['voice']
                voice.add_zero_shot_spk(profile['instruction'], str(state['pkg']/state['style']['reference_audio']), profile['id'])
                emit('ready', device='CPU LLM + AMD DirectML flow')
            np, torch = state['np'], state['torch']
            state['set_all_random_seed'](profile.get('seed', 42))
            with torch.no_grad():
                audio = np.concatenate([x['tts_speech'].cpu().numpy()[0] for x in voice.inference_instruct2(text,profile['instruction'],'',zero_shot_spk_id=profile['id'],stream=False,speed=rate,text_frontend=False)])
            if not len(audio) or not np.isfinite(audio).all() or np.abs(audio).max()<1e-4:
                raise RuntimeError('Empty or invalid speech audio')
            state['sf'].write(str(output),audio*min(1.,.89/float(np.abs(audio).max())),voice.sample_rate,subtype='PCM_16')
        emit('completed', id=request_id)
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        emit('error', id=request_id, message='Feiyu: '+str(error))
