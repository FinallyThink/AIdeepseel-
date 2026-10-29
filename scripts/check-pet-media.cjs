const {app,BrowserWindow}=require('electron');
const path=require('node:path');
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false,webPreferences:{autoplayPolicy:'no-user-gesture-required'}});
  try{
    await w.loadFile(path.resolve(__dirname,'../dist/index.html'));
    const results=await w.webContents.executeJavaScript(`(async()=>{
      const results=[];
      for(const pose of ${JSON.stringify(['idle','think','happy',...require('../renderer/dsh-actions.json').map(a=>a.id)])}){
        const v=document.createElement('video');v.muted=true;v.loop=true;v.src='./dsh-pet/'+pose+'.webm';document.body.append(v);
        const result=await new Promise(resolve=>{const timer=setTimeout(()=>resolve({pose,error:'timeout'}),10000);v.onerror=()=>{clearTimeout(timer);resolve({pose,error:v.error?.message});};v.onloadeddata=async()=>{try{await v.play();await new Promise(r=>setTimeout(r,250));clearTimeout(timer);resolve({pose,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,playing:!v.paused});}catch(e){clearTimeout(timer);resolve({pose,error:e.message});}};});
        results.push(result);v.pause();v.remove();
      }return results;
    })()`);
    require('node:fs').writeFileSync(path.resolve(__dirname,'../artifacts/pet-media-check.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));app.exit(results.every(r=>r.playing&&r.time>0)?0:1);
  }catch(e){console.error(e.message);app.exit(1);}
});
