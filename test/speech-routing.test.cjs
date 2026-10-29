const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const{Speech}=require('../electron/speech.cjs');const{GPUSpeech}=require('../electron/gpu-speech.cjs');
test('GPU and Windows voices coexist; GPU renders audio instead of playing early',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanjing-voice-'));let gpuRequests=0,systemRequests=0;
 const gpu={voices:()=>[{id:'gpt-sovits:sunshine-girl',name:'阳光少女'},{id:'gpt-sovits:heartful-sister',name:'知心大姐姐'}],render:async(text,config,file)=>{gpuRequests++;assert.equal(config.volume,0.1);fs.writeFileSync(file,Buffer.alloc(100));},close(){}};
 const speech=new Speech(dir,{gpu});speech.run=async req=>{if(req.mode==='voices')return{voices:[{id:'system',language:'zh-CN',gender:'female'}]};systemRequests++;fs.writeFileSync(req.outputFile,Buffer.alloc(100));};
 try{await speech.initialize();assert.equal(speech.voices.length,3);const a=await speech.render('你好',{voice:'gpt-sovits:sunshine-girl',rate:1,volume:0.1});assert.equal(gpuRequests,1);assert.equal(systemRequests,0);speech.cleanup(a);const b=await speech.render('你好',{voice:'system',rate:1});assert.equal(systemRequests,1);speech.cleanup(b);}
 finally{speech.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('missing GPU models do not advertise available voices',()=>{const gpu=new GPUSpeech({runtimeRoot:path.join(os.tmpdir(),'no-lanjing-models')});assert.deepEqual(gpu.voices(),[]);gpu.close();});
test('Feiyu routes new text to CosyVoice synthesis instead of Windows speech',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanjing-feiyu-'));let called=false;
 const speech=new Speech(dir,{gpu:{render:async(text,config,file)=>{called=true;assert.equal(config.voice,'cosyvoice3:feiyu-cute-goofy');assert.equal(text,'new dialogue');fs.writeFileSync(file,Buffer.alloc(100));},close(){}}});
 speech.run=async()=>{throw Error('Unexpected Windows fallback');};
 try{const file=await speech.render('new dialogue',{voice:'cosyvoice3:feiyu-cute-goofy',rate:1});assert.equal(called,true);speech.cleanup(file);}finally{speech.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('GPU synthesis failure does not silently switch to system voice',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanjing-voice-'));let system=false;const speech=new Speech(dir,{gpu:{render:async()=>{throw Error('GPU failure');},close(){}}});speech.run=async()=>{system=true;};
 try{await assert.rejects(speech.render('你好',{voice:'gpt-sovits:heartful-sister',rate:1}),/GPU failure/);assert.equal(system,false);}finally{speech.close();fs.rmSync(dir,{recursive:true,force:true});}
});
