const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VOICES = [
  { id:'gpt-sovits:sunshine-girl', dir:'sunshine-girl', name:'阳光少女 · AMD GPU' },
  { id:'gpt-sovits:heartful-sister', dir:'heartful-sister', name:'知心大姐姐 · AMD GPU' },
  { id:'cosyvoice3:feiyu-cute-goofy', dir:'feiyu', name:'肥鱼 · 憨萌得意 · AMD GPU', engine:'cosyvoice3-directml' }
];
class GPUSpeech {
  constructor({ runtimeRoot = process.env.LANJING_TTS_ROOT || 'E:/codex/live2d形象', spawnImpl = spawn, timeoutMs = 300000 } = {}) {
    this.root=path.resolve(runtimeRoot);this.spawn=spawnImpl;this.timeoutMs=timeoutMs;this.worker=null;this.closed=false;this.tail=Promise.resolve();this.device=null;
    this.python=path.join(this.root,'runtime/tts-directml/Scripts/python.exe');
    this.script=path.join(__dirname,'native/gpu-render.py');
  }
  voices() {
    return VOICES.filter(v=>{
      try {
        const dir=path.join(this.root,'voices',v.dir);const m=JSON.parse(fs.readFileSync(path.join(dir,'voice.json'),'utf8'));
        if(v.engine==='cosyvoice3-directml'){
          const pkg=path.join(this.root,'runtime/feiyu-model');const manifest=JSON.parse(fs.readFileSync(path.join(pkg,'manifest.json'),'utf8'));const style=manifest.styles.cute;
          return [this.python,path.join(__dirname,'native/feiyu-render.py'),path.join(this.root,'tools/benchmark-feiyu.py'),path.join(pkg,manifest.base_model_dir),path.join(pkg,style.llm_checkpoint),path.join(pkg,style.reference_audio)].every(f=>fs.existsSync(f));
        }
        const files=[this.python,this.script,path.join(this.root,'runtime/source/GPT-SoVITS-0ab0e5390f9fd7e1b09c9c3eb5b654e295e43ed4/api.py'),
          path.join(this.root,'runtime/base-models/chinese-hubert-base/pytorch_model.bin'),path.join(this.root,'runtime/base-models/chinese-roberta-wwm-ext-large/pytorch_model.bin'),
          ...['gptWeights','sovitsWeights','referenceAudio','referenceTextFile'].map(k=>path.join(dir,m[k]))];
        return files.every(f=>fs.existsSync(f));
      }catch{return false;}
    }).map(v=>({...v,language:'zh-CN',gender:'female',engine:v.engine||'gpt-sovits-directml'}));
  }
  async ensure(voice) {
    if(this.closed)throw Error('GPU 语音服务已关闭');
    if(this.worker?.voice===voice.id&&!this.worker.stopping)return this.worker;
    await this.stop();
    const script=voice.engine==='cosyvoice3-directml'?path.join(__dirname,'native/feiyu-render.py'):this.script;
    const child=this.spawn(this.python,['-u',script,'--runtime-root',this.root,'--voice-dir',voice.dir],{
      cwd:this.root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}
    });
    const worker={child,voice:voice.id,active:null,stderr:'',stopping:false};this.worker=worker;
    worker.closed=new Promise(r=>worker.onClosed=r);
    child.stderr.on('data',d=>worker.stderr=(worker.stderr+d.toString('utf8')).slice(-2000));child.stdin.on('error',()=>{});
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{
      let event;try{event=JSON.parse(line.replace(/^\uFEFF/,''));}catch{return;}
      if(event.event==='ready'){this.device=event.device;return;}
      const active=worker.active;if(!active||active.id!==event.id)return;
      if(event.event==='completed'){worker.active=null;active.resolve(event);}
      if(event.event==='error'){worker.active=null;active.reject(Error(event.message||'GPU 合成失败'));}
    });
    child.once('error',e=>{worker.active?.reject(Error('GPU 语音启动失败：'+e.message));worker.active=null;});
    child.once('close',code=>{lines.close();if(this.worker===worker)this.worker=null;worker.active?.reject(Error(worker.stopping?'GPU 语音已停止':`GPU 语音退出（${code}）：${worker.stderr}`));worker.active=null;worker.onClosed();});
    return worker;
  }
  async stop(){const worker=this.worker;if(!worker)return;worker.stopping=true;worker.child.kill();await worker.closed;}
  render(text,config,outputFile){
    const task=this.tail.then(async()=>{
      const voice=VOICES.find(v=>v.id===config.voice);if(!voice||!this.voices().some(v=>v.id===voice.id))throw Error('GPU 音色资源不完整，请检查 LANJING_TTS_ROOT');
      const worker=await this.ensure(voice);if(this.closed)throw Error('GPU 语音服务已关闭');
      let timer;
      try{return await new Promise((resolve,reject)=>{
        const id=randomUUID();worker.active={id,resolve,reject};
        timer=setTimeout(()=>{reject(Error('GPU 语音合成超时，请缩短回复或重试'));void this.stop();},this.timeoutMs);
        worker.child.stdin.write(JSON.stringify({id,text,rate:config.rate??1,volume:1,outputFile})+'\n','utf8',error=>{if(error){reject(Error('GPU 语音连接中断'));void this.stop();}});
      });}finally{clearTimeout(timer);}
    });
    this.tail=task.catch(()=>{});return task;
  }
  close(){this.closed=true;void this.stop();}
}
module.exports={GPUSpeech,VOICES};
