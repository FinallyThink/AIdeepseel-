const {GPUSpeech,VOICES}=require('../electron/gpu-speech.cjs');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const gpu=new GPUSpeech();const directory=path.resolve(__dirname,'../artifacts/voice-tests');fs.mkdirSync(directory,{recursive:true});const result=[];
 try{for(const voice of VOICES){const file=path.join(directory,voice.dir+'.wav');const started=Date.now();console.log('开始合成：'+voice.name);
   const event=await gpu.render(voice.dir==='sunshine-girl'?'你好呀，我是澜鲸，今天也要开心哦。':'你好，我是澜鲸，愿你今晚轻松自在。',{voice:voice.id,rate:1},file);
   const item={voice:voice.id,name:voice.name,device:gpu.device,bytes:fs.statSync(file).size,seconds:(Date.now()-started)/1000,audioSeconds:event.audioSeconds,file};result.push(item);console.log(JSON.stringify(item));
 }fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));}
 finally{gpu.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
