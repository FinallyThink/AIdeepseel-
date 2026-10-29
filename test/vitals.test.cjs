const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const{Pipeline}=require('../electron/pipeline.cjs');const{defaults,Settings,DEFAULT_PERSONALITY,atomic}=require('../electron/settings.cjs');const{giftPoints}=require('../electron/vitals.cjs');const{AI}=require('../electron/ai.cjs');
const gift=(id,extra={})=>({id,kind:'gift',room:'r',user:'小鱼',gift:'小心心',count:1,...extra});
function make(restored={}){let saved;const settings={config:{...defaults,roomId:'r'},getKey:()=>''};const p=new Pipeline({settings,restored,ai:{reply:async()=> '谢谢，祝你开心',select:async()=>null},speech:{render:async()=>'/voice.wav'},persist:s=>saved=structuredClone(s)});return{p,settings,saved:()=>saved};}
test('gift price multiplied by incremental count; hearts always have unit value one',async()=>{
 const{normalize}=await import('../src/bridge.js');const e=normalize({Type:5,Data:{MsgId:'1',RoomId:'r',GiftName:'礼花',GiftCount:3,RepeatCount:90,DiamondCount:10}});
 assert.equal(e.giftValue,10);assert.equal(giftPoints(e),30);assert.equal(giftPoints(gift('h',{giftValue:100,count:3})),3);assert.equal(giftPoints(gift('unknown',{gift:'未知礼物',giftValue:null,count:2})),2);
});
test('gift immediately raises food and happiness once, including while paused; state survives restart',()=>{
 const{p,saved}=make();assert.deepEqual(p.pet(),{food:20,happiness:50});p.ingest(gift('a',{count:3}));assert.deepEqual(p.pet(),{food:23,happiness:53});assert.equal(p.ingest(gift('a',{count:3})),false);assert.deepEqual(p.pet(),{food:23,happiness:53});
 assert.deepEqual(p.snapshot().vitalEvents.map(e=>e.delta),[3,3]);const next=make(saved()).p;assert.deepEqual(next.pet(),{food:23,happiness:53});assert.equal(next.snapshot().vitalEvents.length,0);assert.equal(next.ingest(gift('a')),false);
});
test('one food deducted on completed reply, not preparation, start or failure; retried ACK never double spends',async()=>{
 const{p}=make();p.enqueue({id:'chat',kind:'chat',room:'r',user:'小鱼',content:'你好'});p.start();p.setOutput(true);await p.prepare();const id=p.current.id;assert.equal(p.pet().food,20);p.started(id);assert.equal(p.pet().food,20);p.ended(id,'failed');assert.equal(p.pet().food,20);p.retry(id);p.started(id);p.ended(id);assert.equal(p.pet().food,19);assert.equal(p.pet().happiness,50);p.ended(id);assert.equal(p.pet().food,19);assert.equal(p.petEvents.at(-1).delta,-1);
});
test('zero food never becomes negative or prevents mandatory gift reply',async()=>{
 const{p}=make({petStates:{live:{food:0,happiness:0}}});p.enqueue(gift('g'));p.start();p.setOutput(true);await p.prepare();assert.ok(p.current);const id=p.current.id;p.started(id);p.ended(id);assert.equal(p.pet().food,0);assert.equal(p.stats.spoken,1);
});
test('simulation cannot change live food or happiness; reset applies configured starting values only while idle',()=>{
 const{p,settings}=make();p.ingest(gift('live'));settings.config.simulation=true;p.ingest(gift('demo'));assert.deepEqual(p.pet(),{food:21,happiness:51});settings.config.simulation=false;assert.deepEqual(p.pet(),{food:21,happiness:51});settings.config.initialFood=30;p.resetPet();assert.deepEqual(p.pet(),{food:30,happiness:50});p.start();assert.throws(()=>p.resetPet(),/暂停/);
});
test('default persona migrates without replacing a custom persona and removed vitals stay out of AI context',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanjing-persona-'));try{
 atomic(path.join(dir,'settings.json'),{personality:'温柔、聪明、自然，带一点俏皮。你叫澜鲸，是蓝鲸主题的虚拟主播。'});const s=new Settings(dir,{});assert.equal(s.config.personality,DEFAULT_PERSONALITY);s.save({personality:'我的自定义人设'});assert.equal(new Settings(dir,{}).config.personality,'我的自定义人设');
 const ai=new AI(s);let data;ai.json=async(system,d)=>{data=d;return{text:'你好'};};await ai.reply({kind:'chat'},[],{food:3,happiness:99});assert.equal(data.hostState,undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
