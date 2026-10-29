const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { GPUSpeech } = require('./gpu-speech.cjs');
class Speech {
  constructor(directory,{gpu=new GPUSpeech()}={}){this.directory=directory;fs.mkdirSync(directory,{recursive:true});this.children=new Set();this.voices=[];this.error=null;this.gpu=gpu;}
  run(request){return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-MTA','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'native/speech.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.children.add(child);let stdout='',stderr='';const timer=setTimeout(()=>child.kill(),60000);
    child.stdout.on('data',d=>stdout+=d.toString('utf8'));child.stderr.on('data',d=>stderr+=d.toString('utf8'));child.stdin.on('error',()=>{});
    child.on('error',reject);child.on('close',code=>{clearTimeout(timer);this.children.delete(child);try{const lines=stdout.trim().split(/\r?\n/);const result=JSON.parse(lines.at(-1).replace(/^\uFEFF/,''));if(code!==0||result.event==='error')throw Error(result.message||stderr||'语音生成失败');resolve(result);}catch(e){reject(Error(e.message||'语音进程失败'));}});
    child.stdin.end(JSON.stringify(request),'utf8');
  });}
  async initialize(){const gpuVoices=this.gpu.voices();try{const r=await this.run({mode:'voices'});this.voices=[...gpuVoices,...r.voices.map(v=>({...v,engine:'windows'}))];this.error=null;}catch(e){this.voices=gpuVoices;this.error=gpuVoices.length?null:e.message;}}
  async render(text,config){
    const voice=config.voice||this.voices.find(v=>v.language.startsWith('zh')&&v.gender==='female')?.id||this.voices[0]?.id;
    if(!voice)throw Error(this.error||'未找到系统音色');
    const file=path.join(this.directory,randomUUID()+'.wav');
    try{if(voice.startsWith('gpt-sovits:')||voice.startsWith('cosyvoice3:'))await this.gpu.render(text,{...config,voice},file);else {await this.gpu.stop?.();await this.run({mode:'render',text,voice,rate:config.rate,volume:1,outputFile:file});}if(fs.statSync(file).size<44)throw Error('生成音频为空');return file;}catch(e){this.cleanup(file);throw e;}
  }
  cleanup(file){if(file&&path.dirname(file)===this.directory)try{fs.unlinkSync(file);}catch{}}
  close(){this.gpu.close();for(const c of this.children)c.kill();}
}
module.exports={Speech};
