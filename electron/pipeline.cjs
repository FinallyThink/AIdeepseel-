const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const vitals=require('./vitals.cjs');
class Pipeline extends EventEmitter {
  constructor({ settings, ai, speech, persist = () => {}, restored = {}, now = Date.now }) {
    super(); this.settings=settings; this.ai=ai; this.speech=speech; this.persist=persist; this.now=now;
    this.jobs=(restored.jobs||[]).map(j=>({...j,state:['offered','playing','failed'].includes(j.state)?'failed':'queued',audio:null,error:['offered','playing'].includes(j.state)?'上次退出时播放状态不确定，请确认后重试':j.state==='failed'?j.error:null}));
    this.history=restored.history||[]; this.seen=new Map(restored.seen||[]); this.candidates=[]; this.feed=[];
    this.petStates={live:vitals.restore(restored.petStates?.live,this.config()),demo:vitals.restore(restored.petStates?.demo,this.config())};this.petEvents=[];
    this.running=false; this.preparing=false; this.selecting=false; this.lastSelection=0; this.current=null; this.outputReady=false;this.lastActivity=this.now();
    this.error=null; this.stats={received:0,selected:0,spoken:0}; this.closed=false; this.serial=0;this.chatHandler=()=>false;this.canDispatch=()=>true;this.lastWelcome=-Infinity;this.welcomed=new Map();
  }
  config() { return this.settings.config; }
  snapshot() {
    return {running:this.running,preparing:this.preparing,selecting:this.selecting,current:this.current,
      jobs:this.jobs.map(({audio,...j})=>j),candidates:this.candidates,feed:this.feed,history:this.history,
      normalCount:this.jobs.filter(j=>j.event.kind==='chat').length,stats:this.stats,error:this.error,outputReady:this.outputReady,
      vitals:{...this.pet()},vitalEvents:this.petEvents.filter(e=>e.mode===this.petMode())};
  }
  changed() {
    this.persist({jobs:this.jobs.map(({audio,...j})=>j),history:this.history,seen:[...this.seen].slice(-5000),petStates:this.petStates});
    this.emit('state',this.snapshot());
  }
  ingest(event) {
    if (!event || !['chat','gift','enter','follow'].includes(event.kind)) return false;
    const room=this.config().roomId;
    if (!room || ![event.room,event.webRoom].includes(room)) return false;
    if(room===event.room&&event.webRoom&&room!=='demo')this.settings.save({roomId:event.webRoom});
    const now=this.now(); for (const [key,at] of this.seen) if(now-at>86400000) this.seen.delete(key);
    const followKey=event.kind==='follow'?`${event.webRoom||event.room}:follow-user:${event.userId||event.user}`:null;
    if(followKey&&this.seen.has(followKey))return false;
    const key=event.id?`${event.room}:${event.kind}:${event.id}`:`${event.room}:${event.kind}:${event.userId||event.user}:${event.content}:${event.gift}:${event.count}:${Math.floor(now/3000)}`;
    if(this.seen.has(key)) return false;
    this.seen.set(key,now); if(this.seen.size>5000)this.seen.delete(this.seen.keys().next().value);
    if(followKey)this.seen.set(followKey,now);
    event={...event,id:event.id||randomUUID(),at:now}; this.stats.received++;if(event.kind!=='enter')this.lastActivity=now;
    this.feed=[event,...this.feed].slice(0,100);
    // Gifts are persisted even while paused; no queue limit or age-based dropping.
    if(event.kind==='gift') {this.enqueue(event);const points=vitals.giftPoints(event);this.petChange('food',points,event.gift+' × '+event.count);this.petChange('happiness',points,event.gift+' × '+event.count);this.emit('gift',event);}
    else if(event.kind==='follow')this.enqueue(event);
    else if(event.kind==='enter'){
      for(const[key,at]of this.welcomed)if(now-at>=300000)this.welcomed.delete(key);
      const identity=`${event.webRoom||event.room}:${event.userId||event.user}`;
      if(this.running&&this.outputReady&&now-this.lastWelcome>=20000&&!this.welcomed.has(identity)&&!this.jobs.some(j=>j.event.kind==='enter')){
        this.enqueue(event);this.lastWelcome=now;this.welcomed.set(identity,now);if(this.welcomed.size>1000)this.welcomed.delete(this.welcomed.keys().next().value);
      }
    }
    else if(!this.chatHandler(event))this.candidates=[...this.candidates,event].slice(-100);
    this.changed(); return true;
  }
  enqueue(event) {
    if(event.kind==='chat' && this.jobs.filter(j=>j.event.kind==='chat').length>=5) return false;
    this.jobs.push({id:randomUUID(),event,state:'queued',text:null,audio:null,error:null,createdAt:this.now()});
    this.stats.selected++; return true;
  }
  async select() {
    if(!this.running||this.selecting||this.closed||this.jobs.filter(j=>j.event.kind==='chat').length>=5) return;
    this.candidates=this.candidates.filter(e=>this.now()-e.at<this.config().candidateAgeMs);
    if(!this.candidates.length||this.now()-this.lastSelection<this.config().selectionIntervalMs) return;
    this.lastSelection=this.now(); this.selecting=true; this.changed();
    const serial=this.serial;
    try {
      const candidates=this.candidates.slice(-30); const id=await this.ai.select(candidates,this.history);
      if(this.closed||serial!==this.serial||!this.running)return;
      const selected=this.candidates.find(e=>e.id===id);
      if(selected && this.now()-selected.at<this.config().candidateAgeMs && this.enqueue(selected)) this.candidates=this.candidates.filter(e=>e.id!==id);
    } catch(e) { this.error='选评失败：'+e.message; }
    finally {this.selecting=false;this.changed();}
  }
  async prepare() {
    if(!this.running||this.preparing||this.closed)return;
    this.discardDisabledIdle();
    this.expireWelcomes();
    const capacity=this.config().speechPreloadCount||2;
    const reserved=this.jobs.filter(j=>['ready','offered','generating','synthesizing'].includes(j.state)).length;
    const priority=j=>j.event.kind==='gift'?0:j.event.kind==='follow'?1:2;
    const queued=this.jobs.filter(j=>j.state==='queued').sort((a,b)=>priority(a)-priority(b));
    const urgent=queued[0]&&priority(queued[0])<2&&!this.jobs.some(j=>['ready','offered','generating','synthesizing'].includes(j.state)&&priority(j)<=priority(queued[0]));
    const pending=queued.slice(0,Math.max(urgent?1:0,capacity-reserved));
    if(!pending.length)return;
    this.preparing=true;
    for(const job of pending)job.state='generating';
    this.changed();
    try { await Promise.all(pending.map(job=>this.prepareJob(job))); }
    finally {this.preparing=false;this.changed();this.dispatch();}
  }
  async prepareJob(job) {
    try {
      try { job.text=job.event.kind==='api'&&job.event.mode==='say'?job.event.content:await this.ai.reply(job.event,this.history,{...this.pet()}); }
      catch(e) {
        if(!['gift','enter','follow'].includes(job.event.kind))throw e;
        job.text=job.event.kind==='follow'?`谢谢${job.event.user}的关注！很高兴遇见你，愿这里的海风给你带来好心情。`:job.event.kind==='enter'?`欢迎${job.event.user}来到直播间，我是澜鲸，来这里轻松坐坐吧！`:`谢谢${job.event.user}送来的${job.event.count}个${job.event.gift}！祝你平安喜乐，每天都有好心情。`;
        job.fallback=true;
      }
      if(this.closed||!this.jobs.includes(job))return;
      job.state='synthesizing';this.changed();
      job.audio=await this.speech.render(job.text,this.config());
      if(this.closed||!this.jobs.includes(job)){this.emit('cleanup',job.audio);return;}
      job.state='ready';job.error=null;this.error=null;
    } catch(e) {job.state='failed';job.error=e.message;this.error='回复准备失败：'+e.message;}
    finally {this.changed();this.dispatch();}
  }
  dispatch() {
    if(!this.running||!this.outputReady||this.current||this.closed||!this.canDispatch())return;
    this.discardDisabledIdle();
    this.expireWelcomes();
    const ready=this.jobs.filter(j=>j.state==='ready');const gift=ready.find(j=>j.event.kind==='gift');
    if(!gift&&this.jobs.some(j=>j.event.kind==='gift'&&['queued','generating','synthesizing'].includes(j.state)))return;
    const follow=ready.find(j=>j.event.kind==='follow');
    if(!gift&&!follow&&this.jobs.some(j=>j.event.kind==='follow'&&['queued','generating','synthesizing'].includes(j.state)))return;
    const job=gift||follow||ready[0];if(!job)return;
    if(this.jobs.some(j=>this.jobs.indexOf(j)<this.jobs.indexOf(job)&&['queued','generating','synthesizing'].includes(j.state)&&(j.event.kind===job.event.kind||(!['gift','follow'].includes(j.event.kind)&&!['gift','follow'].includes(job.event.kind)))))return;
    job.state='offered';this.current={id:job.id,state:'buffering'};this.changed();
    this.emit('play',{id:job.id,audio:job.audio,text:job.text,event:job.event});
  }
  started(id) {
    const j=this.jobs.find(j=>j.id===id);if(!j||j.state!=='offered'||this.current?.id!==id)return;
    j.state='playing';this.current={id,state:'playing',text:j.text,event:j.event,startedAt:this.now()};
    this.history=[...this.history.filter(h=>h.id!==id),{id,event:j.event,text:j.text,at:this.now()}].slice(-60);this.changed();
  }
  ended(id,error=null) {
    const j=this.jobs.find(j=>j.id===id);if(!j||this.current?.id!==id)return;
    if(error){j.state='failed';j.error=error;this.error='播放失败：'+error;}
    else {this.jobs=this.jobs.filter(x=>x.id!==id);this.stats.spoken++;this.petChange('food',-1,'完成一次回复');this.emit('cleanup',j.audio);this.emit('completed',{id:j.id,event:j.event,text:j.text,at:this.now()});}
    this.current=null;this.lastActivity=this.now();this.changed();this.dispatch();
  }
  setOutput(ready) {
    this.outputReady=ready;
    if(!ready&&this.current){const j=this.jobs.find(x=>x.id===this.current.id);if(j){j.state='failed';j.error='展示端断开，播报可能未完成，请确认后重试';}this.current=null;}
    this.changed();this.dispatch();
  }
  petMode(){return this.config().simulation?'demo':'live';}
  pet(){return this.petStates[this.petMode()];}
  petChange(metric,amount,reason){const e=vitals.change(this.pet(),metric,amount,reason,this.now());if(e)this.petEvents=[...this.petEvents,{...e,mode:this.petMode()}].slice(-40);}
  resetPet(){if(this.running||this.current||this.preparing)throw Error('请先暂停并等待当前回复结束，再重置数值');const target=vitals.initial(this.config());this.petChange('food',target.food-this.pet().food,'管理端重置');this.petChange('happiness',target.happiness-this.pet().happiness,'管理端重置');this.changed();}
  start(){if(!this.running)this.lastActivity=this.now();this.running=true;this.error=null;this.changed();this.dispatch();}
  pause(){this.running=false;this.serial++;this.changed();}
  clearRecords(){
    if(this.running||this.current||this.preparing||this.selecting)throw Error('请先暂停互动，并等待当前生成、合成或播报结束，再清空记录');
    const jobs=this.jobs;
    this.serial++;this.jobs=[];this.candidates=[];this.feed=[];this.history=[];this.error=null;
    this.stats={received:0,selected:0,spoken:0};this.lastActivity=this.now();
    // Preserve deduplication and long-term memory; clearing must not replay old gifts.
    this.changed();
    for(const job of jobs)if(job.audio)this.emit('cleanup',job.audio);
  }
  retry(id){const j=this.jobs.find(x=>x.id===id);if(j?.state!=='failed')throw Error('只能重试失败消息');j.state=j.audio?'ready':'queued';j.error=null;this.changed();this.dispatch();}
  remove(id){const j=this.jobs.find(x=>x.id===id);if(!j)return;if(j.event.kind==='gift')throw Error('礼物必须保留，无法删除；请重试');if(!['queued','failed','ready'].includes(j.state))throw Error('当前消息正在处理');this.jobs=this.jobs.filter(x=>x.id!==id);this.emit('cleanup',j.audio);this.changed();}
  changeRoom(room){if(this.jobs.length||this.preparing||this.selecting)throw Error('请先处理完队列再更换房间');this.settings.save({roomId:room});this.candidates=[];this.feed=[];this.serial++;this.changed();}
  expireWelcomes(){
    const expired=this.jobs.filter(j=>j.event.kind==='enter'&&['queued','ready','failed'].includes(j.state)&&this.now()-j.createdAt>=60000);
    if(!expired.length)return;this.jobs=this.jobs.filter(j=>!expired.includes(j));for(const j of expired)this.emit('cleanup',j.audio);this.changed();
  }
  discardDisabledIdle(){
    if(this.config().autoChatEnabled!==false)return;
    const removed=this.jobs.filter(j=>j.event.kind==='idle'&&j.id!==this.current?.id);
    if(!removed.length)return;
    this.jobs=this.jobs.filter(j=>!removed.includes(j));
    for(const job of removed)this.emit('cleanup',job.audio);
    this.changed();
  }
  queueIdle(){
    if(this.config().autoChatEnabled===false)return;
    if(!this.running||!this.outputReady||this.current||this.preparing||this.selecting||!this.canDispatch())return;
    if(this.now()-this.lastActivity<30000||this.jobs.some(j=>j.state!=='failed'))return;
    this.lastActivity=this.now();
    // Failed idle speech should not accumulate or prevent the next attempt.
    this.jobs=this.jobs.filter(j=>{if(j.event.kind!=='idle')return true;this.emit('cleanup',j.audio);return false;});
    this.enqueue({id:randomUUID(),kind:'idle',room:this.config().roomId,user:'澜鲸主动聊天',content:'安静了一会儿，接着聊聊',at:this.now()});this.changed();
  }
  async tick(){if(this.closed)return;await this.select();this.queueIdle();await this.prepare();this.dispatch();}
  close(){this.closed=true;this.running=false;this.serial++;this.ai.close?.();this.speech.close?.();this.changed();}
}
module.exports={Pipeline};
