const {EventEmitter}=require('node:events');const{randomUUID}=require('node:crypto');
const command=text=>/^[#＃]?点歌(?:\s*[:：]\s*|\s+)(.+)$/u.exec(String(text||'').trim())?.[1]?.trim()||null;
const identity=e=>e.userId&&e.userId!=='0'?String(e.userId):null;
const sameRoom=(a,b)=>[a.room,a.webRoom].filter(Boolean).some(x=>x===b.room||(b.webRoom&&x===b.webRoom));
class Music extends EventEmitter{
  constructor({settings,provider,persist=()=>{},restored={},canPlay=()=>false,now=Date.now}){
    super();this.settings=settings;this.provider=provider;this.persist=persist;this.canPlay=canPlay;this.now=now;this.current=null;this.preparing=false;this.outputReady=false;this.closed=false;
    this.donors=restored.donors||{live:{},demo:{}};this.donors.live||={};this.donors.demo||={};this.notices=[];this.lastRequest=restored.lastRequest||{};this.position=0;
    this.defaultRetryAt=0;
    this.queue=(restored.queue||[]).filter(j=>!j.isDefault).map(j=>({...j,url:null,state:['offered','playing','paused','failed'].includes(j.state)?'failed':j.track?'queued':'searching',error:['offered','playing','paused'].includes(j.state)?'上次播放中断，请确认后重试':j.error||null}));
  }
  mode(){return this.settings.config.simulation?'demo':'live';}
  visible(){return this.queue.filter(j=>j.mode===this.mode());}
  changed(){try{this.persist({donors:this.donors,lastRequest:this.lastRequest,queue:this.queue.map(({url,...j})=>j)});this.error=null;}catch(e){this.error='点歌记录保存失败：'+e.message;}this.emit('state');}
  snapshot(){const clean=({url,...j})=>j;return{queue:this.visible().map(clean),current:this.current?this.visible().filter(j=>j.id===this.current).map(clean)[0]||null:null,position:this.position,preparing:this.preparing,donorCount:Object.keys(this.donors[this.mode()]).length,notices:this.notices.slice(-15).reverse(),outputReady:this.outputReady,error:this.error||null};}
  notice(event,text,ok=false){this.notices.push({id:randomUUID(),user:event.user||'观众',text,ok,at:this.now()});this.notices=this.notices.slice(-30);this.emit('state');}
  grant(event,{mode=this.mode(),silent=false}={}){
    const user=identity(event);if(event.kind!=='gift'||!user||!Number.isSafeInteger(Number(event.count))||Number(event.count)<=0)return false;
    const list=this.donors[mode][user]||[];if(list.some(r=>sameRoom(r,event)))return false;
    this.donors[mode][user]=[...list,{room:event.room,webRoom:event.webRoom||'',user:event.user,at:this.now()}];if(!silent)this.changed();return true;
  }
  eligible(event){const id=identity(event);return Boolean(id&&(this.donors[this.mode()][id]||[]).some(r=>sameRoom(r,event)));}
  handleChat(event){const query=command(event.content);if(!query){if(/^[#＃]?点歌\s*[:：]?\s*$/.test(event.content||'')){this.notice(event,'格式：点歌 歌名 / 歌手，或点歌 网易云歌曲 ID');return true;}return false;}
    if(!this.settings.config.musicEnabled){this.notice(event,'点歌暂未开启');return true;}
    if(!identity(event)){this.notice(event,'采集消息缺少用户 ID，暂时无法核验点歌资格');return true;}
    if(!this.eligible(event)){this.notice(event,'点歌仅对本直播间有送礼记录的观众开放');return true;}
    if(query.length>120){this.notice(event,'歌名太长，请使用歌名 / 歌手或网易云歌曲 ID');return true;}
    const active=this.visible().filter(j=>j.state!=='failed');
    if(active.some(j=>j.userId===event.userId)){this.notice(event,'你已有一首歌曲在排队或播放，请听完后再点');return true;}
    if(this.visible().length>=20){this.notice(event,'点歌队列已满，请稍后再试');return true;}
    const key=this.mode()+':'+event.userId;const last=this.lastRequest[key];if(last!==undefined&&this.now()-last<30000){this.notice(event,'点歌间隔为 30 秒，请稍后再试');return true;}
    this.lastRequest[key]=this.now();this.queue.push({id:randomUUID(),query,userId:event.userId,user:event.user,room:event.room,webRoom:event.webRoom||'',mode:this.mode(),state:'searching',track:null,url:null,error:null,at:this.now()});this.notice(event,'正在网易云查找：'+query,true);this.changed();return true;
  }
  async prepare(){
    if(this.closed||this.preparing||!this.settings.config.musicEnabled)return;
    if(this.visible().some(j=>j.state==='ready'))return;
    const job=this.visible().find(j=>['searching','queued'].includes(j.state));if(!job)return;
    this.preparing=true;job.state=job.track?'resolving':'searching';this.changed();
    try{if(!job.track)job.track=await this.provider.find(job.query);if(this.closed)return;
      if(this.visible().some(j=>j.id!==job.id&&j.track?.id===job.track.id&&j.state!=='failed'))throw Error('这首歌已经在排队，请换一首');
      job.state='resolving';this.changed();job.url=await this.provider.resolve(job.track.id);if(this.closed)return;job.state='ready';job.readyAt=this.now();job.error=null;this.notice(job,'已排队：'+job.track.title+' · '+job.track.artist,true);
    }catch(e){job.state='failed';job.error=e.message;this.notice(job,e.message);}
    finally{this.preparing=false;this.changed();this.dispatch();}
  }
  hasReady(){return this.visible().some(j=>j.state==='ready');}
  dispatch(){
    if(this.closed||this.current||!this.outputReady||!this.settings.config.musicEnabled||!this.canPlay())return;
    const job=this.visible().find(j=>j.state==='ready');if(!job)return;
    if(this.now()-job.readyAt>8*60000){job.state='queued';job.url=null;this.changed();return;}
    this.current=job.id;this.position=0;job.state='offered';this.changed();this.emit('play',{id:job.id,track:job.track,user:job.user});
  }
  started(id){const job=this.queue.find(j=>j.id===id);if(this.current!==id||!job||!['offered','paused','playing'].includes(job.state))return;job.state='playing';this.changed();}
  paused(id){const job=this.queue.find(j=>j.id===id);if(this.current!==id||!job)return;job.state='paused';this.changed();}
  progress(id,position){if(this.current!==id||!Number.isFinite(position)||position<0)return;this.position=position;this.emit('state');}
  finished(id,error=null){const job=this.queue.find(j=>j.id===id);if(this.current!==id||!job)return;this.current=null;this.position=0;if(error){job.state='failed';job.error=error;this.notice(job,error);}else this.queue=this.queue.filter(j=>j.id!==id);this.changed();}
  pause(){const job=this.queue.find(j=>j.id===this.current);if(!job)return;const resume=job.state==='paused';job.state=resume?'offered':'paused';this.emit('control',{id:job.id,action:resume?'resume':'pause'});this.changed();}
  skip(){if(!this.current)return;const id=this.current;this.emit('control',{id,action:'stop'});this.finished(id);}
  retry(id){const j=this.visible().find(j=>j.id===id);if(!j||j.state!=='failed')throw Error('只能重试失败点歌');j.state=j.track?'queued':'searching';j.url=null;j.error=null;this.changed();}
  remove(id){const j=this.visible().find(j=>j.id===id);if(!j)throw Error('找不到点歌');if(j.id===this.current||['searching','resolving'].includes(j.state))throw Error('歌曲处理中，请稍候或使用切歌');this.queue=this.queue.filter(j=>j.id!==id);this.changed();}
  async addAdmin(id){if(this.visible().length>=20)throw Error('点歌队列已满');const track=await this.provider.detail(id);this.queue.push({id:randomUUID(),query:track.title,track,user:'管理员试播',userId:'manager',room:this.settings.config.roomId,mode:this.mode(),state:'queued',url:null,at:this.now()});this.changed();}
  setOutput(ready){this.outputReady=ready;if(!ready&&this.current)this.finished(this.current,'展示端断开，歌曲已停止，请确认后重试');this.emit('state');}
  reconcileDefault(){
    const c=this.settings.config;
    const requested=this.visible().some(j=>!j.isDefault&&j.state!=='failed');
    const enabled=c.musicEnabled&&c.musicDefaultLoop&&/^\d+$/.test(c.musicDefaultId||'');
    for(const j of this.queue.filter(j=>j.isDefault)){
      if(!enabled||requested||j.mode!==this.mode()||j.query!==c.musicDefaultId||j.state==='failed'){
        if(j.state==='failed')this.defaultRetryAt=this.now()+60000;
        if(this.current===j.id){this.emit('control',{id:j.id,action:'stop'});this.current=null;this.position=0;}
        this.queue=this.queue.filter(x=>x.id!==j.id);this.changed();
      }
    }
    if(enabled&&!requested&&!this.preparing&&this.outputReady&&this.canPlay()&&this.now()>=this.defaultRetryAt&&!this.visible().some(j=>j.isDefault)){
      this.queue.push({id:randomUUID(),isDefault:true,query:c.musicDefaultId,user:'默认循环',userId:'default-music',room:c.roomId,mode:this.mode(),state:'searching',track:null,url:null,error:null,at:this.now()});this.changed();
    }
  }
  async tick(){this.reconcileDefault();await this.prepare();this.dispatch();}
  close(){this.closed=true;this.changed();}
}
function bindMusic(pipeline,music){
  music.canPlay=()=>pipeline.running&&pipeline.outputReady;
  pipeline.canDispatch=()=>true;pipeline.chatHandler=event=>music.handleChat(event);
  pipeline.on('gift',event=>music.grant(event));
}
module.exports={Music,command,sameRoom,bindMusic};
