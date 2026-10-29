"""Owned JSON-lines worker: AMD inference to WAV, no playback, exit on EOF."""
import argparse
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
import time
import traceback

PROTOCOL = sys.stdout

def emit(event, **values):
    PROTOCOL.write(json.dumps({'event': event, **values}, ensure_ascii=False) + '\n')
    PROTOCOL.flush()

def load_runtime(root, voice_dir):
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', TOKENIZERS_PARALLELISM='false')
    import torch
    import torch_directml
    source = root / 'runtime/source/GPT-SoVITS-0ab0e5390f9fd7e1b09c9c3eb5b654e295e43ed4'
    voice = root / 'voices' / voice_dir
    voice_manifest = json.loads((voice / 'voice.json').read_text(encoding='utf-8'))
    adapters = [(i, torch_directml.device_name(i).rstrip('\x00')) for i in range(torch_directml.device_count())]
    adapter = next((a for a in adapters if 'AMD' in a[1] or 'Radeon' in a[1]), None)
    if adapter is None:
        raise RuntimeError('未找到 AMD DirectML 显卡，请在语音设置中选择系统音色')
    torch.set_num_threads(4)
    os.chdir(source)
    sys.path.insert(0, str(source))
    sys.argv = ['api.py', '-s', str(voice / voice_manifest['sovitsWeights']), '-g', str(voice / voice_manifest['gptWeights']),
                '-d', 'cpu', '-fp', '-hb', str(root / 'runtime/base-models/chinese-hubert-base'),
                '-b', str(root / 'runtime/base-models/chinese-roberta-wwm-ext-large')]
    api = runpy.run_path(str(source / 'api.py'), run_name='owned_tts_worker')
    device = torch_directml.device(adapter[0])
    globals_ = api['get_tts_wav'].__globals__
    globals_['device'] = device
    for name in ['bert_model', 'ssl_model', 'vq_model', 't2s_model']:
        for module in globals_[name].modules():
            if torch.nn.utils.parametrize.is_parametrized(module, 'weight'):
                torch.nn.utils.parametrize.remove_parametrizations(module, 'weight', leave_parametrized=True)
            elif hasattr(module, 'weight_g') and hasattr(module, 'weight_v'):
                torch.nn.utils.remove_weight_norm(module)
        model = globals_[name].to(device)
        if next(model.parameters()).device.type != 'privateuseone':
            raise RuntimeError('语音模型未能加载到 AMD 显卡：' + name)
    return api['get_tts_wav'], voice, voice_manifest, adapter[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime-root', type=Path, required=True)
    parser.add_argument('--voice-dir', default='sunshine-girl')
    options = parser.parse_args()
    generate = None
    # Loading happens only after a request. Closing stdin exits without allocating GPU memory.
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = request['id']
            text = request['text']
            rate, volume = float(request.get('rate', 1)), float(request.get('volume', 0.8))
            if not isinstance(text, str) or not text.strip() or len(text) > 500 or not 0.5 <= rate <= 2 or not 0 <= volume <= 1:
                raise ValueError('无效的语音文本、语速或音量')
            with contextlib.redirect_stdout(sys.stderr):
                if generate is None:
                    generate, voice, voice_manifest, device = load_runtime(options.runtime_root.resolve(), options.voice_dir)
                    emit('ready', device=device, engine='gpt-sovits-directml',
                         modelDevices=voice_manifest.get('modelDevices'), cpuPreprocessing=voice_manifest.get('cpuPreprocessing'))
                import numpy as np
                import soundfile as sf
                import librosa
                emit('synthesizing', id=request_id, device=device, engine='gpt-sovits-directml')
                started = time.perf_counter()
                reference = (voice / voice_manifest['referenceTextFile']).read_text(encoding='utf-8-sig').strip()
                sample_rate, pcm = next(generate(str(voice / voice_manifest['referenceAudio']), reference, 'zh', text, 'zh'))
                audio = pcm.astype(np.float32) / 32768.0
                if abs(rate - 1) > 0.001:
                    audio = librosa.effects.time_stretch(audio, rate=rate)
                audio = np.clip(audio * volume, -1, 1)
                if len(audio) == 0 or not np.isfinite(audio).all():
                    raise RuntimeError('语音生成结果为空或无效')
                output = Path(request['outputFile']).resolve()
                output.parent.mkdir(parents=True, exist_ok=True)
                sf.write(str(output), audio, sample_rate, format='WAV', subtype='PCM_16')
                seconds = time.perf_counter() - started
                emit('completed', id=request_id, device=device, engine='gpt-sovits-directml', generationSeconds=seconds, audioSeconds=len(audio) / sample_rate)
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            emit('error', id=request_id, message='AMD 语音失败：' + str(error))

if __name__ == '__main__':
    main()
