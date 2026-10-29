const {app,BrowserWindow,ipcMain,safeStorage,dialog,protocol,net,shell}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');const {randomUUID}=require('node:crypto');
const {Settings,atomic}=require('./settings.cjs');const {AI}=require('./ai.cjs');const {Speech}=require('./speech.cjs');const {Pipeline}=require('./pipeline.cjs');const {Collector,dbg}=require('./collector.cjs');
const {Memory}=require('./memory.cjs');
const {Music,bindMusic}=require('./music.cjs');const{Netease}=require('./netease.cjs');
const{revealWindow}=require('./window-lifecycle.cjs');
const root=path.resolve(__dirname,'..');const musicSmoke=process.argv.includes('--smoke-music');const smoke=process.argv.includes('--smoke')||musicSmoke;
if(smoke)app.setPath('userData',path.join(root,'.smoke-profile'));
protocol.registerSchemesAsPrivileged(['studio-media','studio-song'].map(scheme=>({scheme,privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}})));
const liveMetrics=new (require('./live-metrics.cjs').LiveMetrics)();
let localAPI;
let manager,display,settings,pipeline,speech,collector,memory,music,timer,playbackTimer,musicPlaybackTimer;let assets=new Map();let quitting=false;let pendingPlay=null;
const ownsInstance=app.requestSingleInstanceLock();let uiReady=false,reopenRequested=false;
if(!ownsInstance)app.quit();
app.on('second-instance',()=>{reopenRequested=true;if(uiReady)openManager();});
function snapshot(){return{metrics:liveMetrics.snapshot(),config:settings.describe(),pipeline:pipeline.snapshot(),collector:collector.snapshot(),memory:memory.snapshot(),music:music.snapshot(),voices:speech.voices,speechError:speech.error,displayOpen:Boolean(display&&!display.isDestroyed())};}
function connectCollector(){const c=settings.config;collector.connectPlatform(c.livePlatform,c.roomId,c.collectorPython);}
function broadcast(){if(!pipeline)return;for(const w of [manager,display])if(w&&!w.isDestroyed())w.webContents.send('studio:state',snapshot());}
function media(file){if(!file)return null;for(const [id,f]of assets)if(f===file)return 'studio-media://asset/'+id;const id=randomUUID();assets.set(id,file);return 'studio-media://asset/'+id;}
function registerAudio(){if(pendingPlay&&display&&!display.isDestroyed())display.webContents.send('studio:play',{...pendingPlay,audio:media(pendingPlay.audio)});}
function windowFor(role){
  const title=role==='display'?'澜鲸 · 直播展示':'澜鲸 · 直播工作台';
  const w=new BrowserWindow({title,width:role==='display'?1440:1420,height:role==='display'?810:940,minWidth:role==='display'?900:1100,minHeight:role==='display'?540:720,backgroundColor:'#080e1b',autoHideMenuBar:true,show:false,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());
  w.on('page-title-updated',event=>{event.preventDefault();w.setTitle(title);});
  w.webContents.on('did-fail-load',(_,code,message)=>console.error(`${title} 页面加载失败 ${code}: ${message}`));
  w.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)console.error(`${title} 渲染错误: ${event.message}`);});
  w.on('unresponsive',()=>console.error(`${title} 窗口无响应`));
  w.once('ready-to-show',()=>{if(role==='manager')revealWindow(w);else w.show();});
  if(process.argv.includes('--dev'))w.loadURL('http://127.0.0.1:5173/#'+role);
  else w.loadFile(path.join(root,'dist/index.html'),{hash:role});
  if(role==='display'){w.on('closed',()=>{display=null;clearTimeout(playbackTimer);clearTimeout(musicPlaybackTimer);pendingPlay=null;pipeline.setOutput(false);music.setOutput(false);broadcast();});w.webContents.on('did-start-loading',()=>{if(pipeline.outputReady){clearTimeout(playbackTimer);clearTimeout(musicPlaybackTimer);pendingPlay=null;pipeline.setOutput(false);music.setOutput(false);}});w.webContents.on('render-process-gone',()=>{clearTimeout(playbackTimer);clearTimeout(musicPlaybackTimer);pendingPlay=null;pipeline.setOutput(false);music.setOutput(false);});}
  else w.on('closed',()=>{manager=null;app.quit();});return w;
}
function openManager(){if(!uiReady)return;if(!revealWindow(manager))manager=windowFor('manager');}
function openDisplay(){if(display&&!display.isDestroyed()){display.show();display.focus();return;}display=windowFor('display');broadcast();}
function requireManager(event){if(event.sender!==manager?.webContents)throw Error('此操作仅供管理端使用');}
app.whenReady().then(async()=>{
  if(!ownsInstance)return;

  const directory=app.getPath('userData');settings=new Settings(directory,safeStorage);speech=new Speech(path.join(directory,'audio'));await speech.initialize();
  if(!settings.config.voice&&speech.voices.length)settings.save({voice:speech.voices.find(v=>v.language.startsWith('zh')&&v.gender==='female')?.id||speech.voices[0].id});
  const stateFile=path.join(directory,'queue.json');let restored={};try{restored=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch{}
  if(smoke){settings.save({simulation:true,roomId:'demo',selectionIntervalMs:2000,...(process.env.LANJING_SMOKE_VOICE?{voice:process.env.LANJING_SMOKE_VOICE}:{})});restored={};}
  memory=new Memory(smoke?path.join(directory,'memory'):path.join(root,'memory'),settings);
  if(!smoke){const stable=require('./room-identity.cjs').stableRoom(settings.config.roomId,[...(restored.history||[]),...(restored.jobs||[]),...memory.records]);if(stable!==settings.config.roomId)settings.save({roomId:stable});}
  const ai=new AI(settings,memory);pipeline=new Pipeline({settings,ai,speech,restored,persist:data=>{try{atomic(stateFile,data);}catch(e){pipeline.error='队列保存失败：'+e.message;}}});
  const musicFile=path.join(directory,'music.json');let musicRestored={};try{musicRestored=JSON.parse(fs.readFileSync(musicFile,'utf8'));}catch{}
  music=new Music({settings,provider:new Netease(),restored:smoke?{}:musicRestored,persist:data=>atomic(musicFile,data)});bindMusic(pipeline,music);
  for(const item of [...memory.records,...pipeline.history,...pipeline.jobs])if(item.event?.kind==='gift')music.grant(item.event,{mode:item.event.room==='demo'?'demo':'live',silent:true});music.changed();
  for(const item of pipeline.history)try{memory.record(item,{source:'legacy'});}catch(e){memory.error='历史档案导入失败：'+e.message;}
  if(!smoke)localAPI=require('./local-api.cjs').createLocalAPI(pipeline,{onError:e=>{pipeline.error='本机接口启动失败：'+e.message;pipeline.changed();}});
  pipeline.on('completed',item=>{try{memory.record(item);}catch(e){memory.error='聊天档案保存失败：'+e.message;memory.notify();}});
  collector=new Collector();collector.on('event',e=>{if(![e.room,e.webRoom].includes(settings.config.roomId))return;if(e.kind==='like'){const leader=liveMetrics.ingest(e);if(leader){pipeline.jobs=pipeline.jobs.filter(j=>!(j.event.source==='like-leader'&&j.state==='queued'));pipeline.enqueue({id:randomUUID(),kind:'api',mode:'say',source:'like-leader',room:e.room,user:'点赞榜',content:'谢谢'+leader.user+'的点赞支持，你现在是本次点赞最多的人，感谢你的陪伴！',at:Date.now()});pipeline.changed();}broadcast();return;}const ok=pipeline.ingest(e);if(ok&&e.kind==='gift'){liveMetrics.ingest(e);broadcast();}dbg('ingest '+(ok?'accepted':'dropped')+' '+e.kind+' room='+e.room+' user='+e.user);});collector.on('state',broadcast);pipeline.on('state',broadcast);memory.on('state',broadcast);music.on('state',broadcast);
  // 已经选过直播间就直接自动连采集器，重启程序后不用再手动点一次；采集器稍后启动也能自动重连。
  if(settings.config.roomId)try{connectCollector();}catch(e){collector.error=e.message;}
  music.on('play',job=>{if(display&&!display.isDestroyed())display.webContents.send('studio:musicPlay',{...job,audio:'studio-song://stream/'+job.id});clearTimeout(musicPlaybackTimer);musicPlaybackTimer=setTimeout(()=>{display?.webContents.send('studio:musicControl',{id:job.id,action:'stop'});music.finished(job.id,'歌曲未能开始播放，请重试或换歌');},30000);});
  music.on('control',data=>{clearTimeout(musicPlaybackTimer);if(display&&!display.isDestroyed())display.webContents.send('studio:musicControl',data);});
  pipeline.on('cleanup',file=>{speech.cleanup(file);for(const[id,f]of assets)if(f===file)assets.delete(id);});
  pipeline.on('play',job=>{pendingPlay=job;registerAudio();clearTimeout(playbackTimer);playbackTimer=setTimeout(()=>{pipeline.ended(job.id,'展示端未及时开始播放，请检查输出窗口');pendingPlay=null;},20000);});
  protocol.handle('studio-media',request=>{const url=new URL(request.url);const file=assets.get(url.pathname.slice(1));return file?net.fetch(pathToFileURL(file).toString()):new Response('Not found',{status:404});});
  protocol.handle('studio-song',async request=>{const id=new URL(request.url).pathname.slice(1);const job=music.queue.find(j=>j.id===id&&j.id===music.current);if(!job?.url)return new Response('Not found',{status:404});try{return await music.provider.stream(job.url,request.headers.get('range'));}catch(e){music.finished(id,e.message);return new Response('Song unavailable',{status:502});}});
  ipcMain.handle('studio:state',()=>snapshot());
  ipcMain.on('studio:ready',event=>{if(event.sender===display?.webContents){pipeline.setOutput(true);music.setOutput(true);broadcast();}});
  ipcMain.on('studio:musicAudio',(event,data)=>{
    if(event.sender!==display?.webContents||!data||music.current!==data.id)return;
    if(data.status==='progress'){music.progress(data.id,data.position);return;}
    clearTimeout(musicPlaybackTimer);
    if(data.status==='playing'){music.started(data.id);const job=music.queue.find(j=>j.id===data.id);musicPlaybackTimer=setTimeout(()=>{display?.webContents.send('studio:musicControl',{id:data.id,action:'stop'});music.finished(data.id,'歌曲播放超时，请换歌');},Math.max(60000,(job?.track?.duration||600000)+60000));}
    else if(data.status==='paused')music.paused(data.id);
    else if(data.status==='ended'||data.status==='error')music.finished(data.id,data.status==='error'?String(data.error||'歌曲播放失败').slice(0,200):null);
  });
  ipcMain.on('studio:audio',(event,{id,status,error})=>{
    if(event.sender!==display?.webContents||pipeline.current?.id!==id)return;
    clearTimeout(playbackTimer);
    if(status==='playing'){pipeline.started(id);playbackTimer=setTimeout(()=>{pipeline.ended(id,'播放超过时限，请检查音频');pendingPlay=null;},180000);}
    else if(status==='ended'||status==='error'){pendingPlay=null;pipeline.ended(id,status==='error'?String(error||'音频播放失败').slice(0,200):null);}
  });
  ipcMain.handle('studio:command',async(event,name,value)=>{
    requireManager(event);
    switch(name){
      case'save':{if(!value||typeof value!=='object')throw Error('设置格式错误');if(value.background!==undefined)throw Error('请通过背景选择按钮修改图片');require('./settings.cjs').validate(value);if(value.simulation!==undefined&&value.simulation!==settings.config.simulation&&(pipeline.running||pipeline.jobs.length||pipeline.selecting||music.visible().length||music.preparing))throw Error('请先暂停并处理完回复、点歌队列，再切换实机或离线模式');if(value.voice&&!speech.voices.some(v=>v.id===value.voice))throw Error('所选音色不可用');if(value.roomId!==undefined&&value.roomId!==settings.config.roomId){if(pipeline.running||music.visible().length||music.preparing)throw Error('请先暂停并处理完点歌队列，再切换房间');pipeline.changeRoom(value.roomId);}if(['roomId','livePlatform','collectorPython'].some(k=>value[k]!==undefined&&value[k]!==settings.config[k])){if(pipeline.running)throw Error('请先暂停互动再修改连接');collector.disconnect();}settings.save(value);broadcast();return snapshot();}
      case'musicSearch':return music.provider.search(value);
      case'musicAdd':await music.addAdmin(String(value));return true;
      case'musicPause':music.pause();return true;
      case'musicSkip':music.skip();return true;
      case'musicRetry':music.retry(String(value));return true;
      case'musicRemove':music.remove(String(value));return true;
      case'musicDemo':{if(!settings.config.simulation||settings.config.roomId!=='demo')throw Error('请先在工作台加入演练消息，进入 demo 房间');const actor={room:'demo',userId:'demo-music-donor',user:'海风听众'};pipeline.ingest({...actor,id:randomUUID(),kind:'gift',gift:'小心心',count:1,giftValue:1});pipeline.ingest({...actor,id:randomUUID(),kind:'chat',content:'点歌 5276808'});return true;}
      case'key':settings.setKey(value);broadcast();return true;
      case'importKey':{const file=path.join(app.getPath('appData'),'deepseek-desktop-pet','deepseek-key.bin');settings.setKey(safeStorage.decryptString(fs.readFileSync(file)));broadcast();return true;}
      case'memoryRead':return memory.read();
      case'memorySave':memory.saveKnowledge(value);return memory.read();
      case'memoryFolder':{const error=await shell.openPath(memory.directory);if(error)throw Error(error);return true;}
      case'memorySummary':{const result=await memory.summarize(ai,{force:true});return{updated:result,memory:memory.read()};}
      case'connect':connectCollector();return true;
      case'disconnect':collector.disconnect();return true;
      case'start':if(!settings.config.roomId)throw Error('请选择直播间或先进入离线演练');if(!settings.config.simulation&&!settings.describe().configured)throw Error('请先配置 AI 密钥');if(!speech.voices.length)throw Error('系统语音不可用');pipeline.start();return true;
      case'pause':pipeline.pause();return true;
      case'clearRecords':pipeline.clearRecords();return true;
      case'display':openDisplay();return true;
      case'fullscreen':openDisplay();display.setFullScreen(!display.isFullScreen());return true;
      case'adminDialogue':return require('./admin-dialogue.cjs').insertDialogue(pipeline,value);
      case'retry':pipeline.retry(String(value));return true;
      case'petReset':pipeline.resetPet();return true;
      case'remove':pipeline.remove(String(value));return true;
      case'demo':{if(!settings.config.simulation)throw Error('请先开启离线演练，避免测试数据进入真实直播');if(settings.config.roomId!=='demo'){pipeline.pause();pipeline.changeRoom('demo');}for(const e of demoEvents())pipeline.ingest(e);return true;}
      case'background':{const r=await dialog.showOpenDialog(manager,{title:'选择直播背景',filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}],properties:['openFile']});if(!r.canceled){const source=r.filePaths[0];if(fs.statSync(source).size>20*1024*1024)throw Error('背景图请小于 20 MB');const dest=path.join(directory,'background'+path.extname(source).toLowerCase());fs.copyFileSync(source,dest);settings.save({background:media(dest)});broadcast();}return true;}
      case'clearBackground':settings.save({background:''});broadcast();return true;
      default:throw Error('未知命令');
    }
  });
  // The persisted background URL is remapped to a local registered file each launch.
  if(settings.config.background){const background=fs.readdirSync(directory).find(f=>/^background\.(png|jpg|jpeg|webp)$/.test(f));settings.config.background=background?media(path.join(directory,background)):'';}
  manager=windowFor('manager');display=windowFor('display');uiReady=true;if(reopenRequested)openManager();timer=setInterval(()=>{void pipeline.tick();void memory.summarize(ai);void music.tick();},500);
  if(smoke)void runSmoke();
}).catch(e=>{console.error(e);dialog.showErrorBox('澜鲸启动失败',String(e.message||e));app.exit(1);});
function demoEvents(){const now=Date.now();return[
  {id:randomUUID(),kind:'chat',room:'demo',user:'海盐汽水',content:'澜鲸，你会梦见大海吗？',at:now},
  {id:randomUUID(),kind:'chat',room:'demo',user:'晚风来信',content:'今天有点累，想听你说说话。',at:now},
  {id:randomUUID(),kind:'gift',room:'demo',userId:'demo-star',user:'星河',gift:'小心心',giftValue:1,count:3,at:now}];}
async function runSmoke(){
  const delay=ms=>new Promise(r=>setTimeout(r,ms));const report={};
  try{for(let i=0;i<40&&!pipeline.outputReady;i++)await delay(250);
    report.manager=await manager.webContents.executeJavaScript('document.body.innerText.includes("直播工作台")');
    report.display=await display.webContents.executeJavaScript('document.body.innerText.includes("澜鲸")');
    report.voices=speech.voices.length;report.voiceIds=speech.voices.map(v=>v.id);report.selectedVoice=settings.config.voice;
    report.blink=false;
    for(let i=0;i<240;i++){
      if(await display.webContents.executeJavaScript("document.querySelector('.character img')?.dataset.blink === 'closed'")){report.blink=true;break;}
      await delay(25);
    }
    const initialVitals={...pipeline.pet()};for(const e of demoEvents())pipeline.ingest(e);await delay(200);
    report.giftVitals=pipeline.pet().food===initialVitals.food+3&&pipeline.pet().happiness===initialVitals.happiness+3;
    report.vitalsRemoved=await display.webContents.executeJavaScript("document.querySelector('.vitals-panel') === null");
    const output=path.join(root,'artifacts');fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'vitals-gain.png'),(await display.webContents.capturePage()).toPNG());
    await delay(1800);
    pipeline.start();
    for(let i=0;i<160&&pipeline.stats.spoken<1;i++)await delay(500);
    report.spoken=pipeline.stats.spoken;report.history=pipeline.history.length;report.error=pipeline.error;pipeline.pause();
    report.replyFood=pipeline.pet().food===initialVitals.food+3-pipeline.stats.spoken;
    fs.writeFileSync(path.join(output,'manager.png'),(await manager.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(output,'display.png'),(await display.webContents.capturePage()).toPNG());
    await manager.webContents.executeJavaScript("[...document.querySelectorAll('nav button')].find(b=>b.innerText.includes('回复队列')).click()");await delay(300);
    report.queue=await manager.webContents.executeJavaScript("document.body.innerText.includes('重启后保留待处理消息')");
    fs.writeFileSync(path.join(output,'queue.png'),(await manager.webContents.capturePage()).toPNG());
    await manager.webContents.executeJavaScript("[...document.querySelectorAll('nav button')].find(b=>b.innerText.includes('参数设置')).click()");await delay(300);
    report.settings=await manager.webContents.executeJavaScript("document.body.innerText.includes('保存全部参数') && !document.body.innerText.includes('保存初始数值') && document.querySelectorAll('input').length > 5");
    fs.writeFileSync(path.join(output,'settings.png'),(await manager.webContents.capturePage()).toPNG());
    await manager.webContents.executeJavaScript("[...document.querySelectorAll('nav button')].find(b=>b.innerText.includes('长期记忆')).click()");await delay(400);
    report.memory=await manager.webContents.executeJavaScript("document.body.innerText.includes('保存记忆文档') && document.querySelector('.memory-editor') !== null");
    const originalNotes=memory.knowledge();
    await manager.webContents.executeJavaScript("window.studio.command('memorySave','# 记忆自检\\n喜欢海洋故事。')");
    report.memorySaved=memory.knowledge().includes('喜欢海洋故事');memory.saveKnowledge(originalNotes);
    report.demoNotArchived=memory.snapshot().total===0;
    fs.writeFileSync(path.join(output,'memory.png'),(await manager.webContents.capturePage()).toPNG());
    await manager.webContents.executeJavaScript("[...document.querySelectorAll('nav button')].find(b=>b.innerText.includes('网易云点歌')).click()");await delay(300);
    report.musicUI=await manager.webContents.executeJavaScript("document.body.innerText.includes('管理端搜索与试播') && document.querySelector('.song-search') !== null");
    if(musicSmoke){
      report.musicUnauthorized=music.eligible({room:'demo',userId:'no-gift'})===false;
      pipeline.start();for(let i=0;i<120&&(pipeline.jobs.length||pipeline.current);i++)await delay(500);
      pipeline.ingest({id:randomUUID(),kind:'chat',room:'demo',userId:'demo-star',user:'星河',content:'点歌 5276808'});
      for(let i=0;i<100&&music.snapshot().current?.state!=='playing';i++)await delay(500);
      report.musicPlaying=music.snapshot().current?.state==='playing'&&await display.webContents.executeJavaScript("document.querySelector('[data-music-playback]')?.dataset.musicPlayback === 'playing'");
      if(!report.musicPlaying)throw Error('真实歌曲未能开始：'+JSON.stringify(music.snapshot().notices));
      pipeline.enqueue({id:randomUUID(),kind:'chat',room:'demo',user:'海风',content:'音乐播放时也聊聊吧'});
      for(let i=0;i<120&&pipeline.current?.state!=='playing';i++)await delay(500);
      report.musicWithVoice=pipeline.current?.state==='playing'&&music.snapshot().current?.state==='playing';
      report.musicDucked=await display.webContents.executeJavaScript(`Number(document.querySelector('[data-music-volume]')?.dataset.musicVolume)===${settings.config.musicVolume*0.25}`);
      for(let i=0;i<120&&pipeline.current;i++)await delay(500);
      report.musicVolumeRestored=await display.webContents.executeJavaScript(`Number(document.querySelector('[data-music-volume]')?.dataset.musicVolume)===${settings.config.musicVolume}`);
      await delay(1500);fs.writeFileSync(path.join(output,'music-display.png'),(await display.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(output,'music-manager.png'),(await manager.webContents.capturePage()).toPNG());
      music.pause();await delay(300);report.musicPause=music.snapshot().current?.state==='paused'&&await display.webContents.executeJavaScript("document.querySelector('[data-music-playback]')?.dataset.musicPlayback === 'paused'");music.pause();await delay(600);report.musicResume=music.snapshot().current?.state==='playing'&&await display.webContents.executeJavaScript("document.querySelector('[data-music-playback]')?.dataset.musicPlayback === 'playing'");music.skip();pipeline.pause();report.musicSkip=music.current===null;
    }else fs.writeFileSync(path.join(output,'music-manager.png'),(await manager.webContents.capturePage()).toPNG());
    report.ok=report.manager&&report.display&&report.queue&&report.settings&&report.memory&&report.memorySaved&&report.demoNotArchived&&report.giftVitals&&report.replyFood&&report.vitalsRemoved&&report.blink&&report.musicUI&&report.spoken>0&&(!musicSmoke||(report.musicPlaying&&report.musicWithVoice&&report.musicDucked&&report.musicVolumeRestored&&report.musicPause&&report.musicResume&&report.musicSkip));atomic(path.join(output,'smoke.json'),report);console.log(JSON.stringify(report));app.exit(report.ok?0:1);
  }catch(e){console.error(e);app.exit(1);}
}
app.on('before-quit',()=>{if(quitting)return;quitting=true;clearInterval(timer);clearTimeout(playbackTimer);clearTimeout(musicPlaybackTimer);localAPI?.close();collector?.disconnect();pipeline?.close();music?.close();});
app.on('window-all-closed',()=>app.quit());
