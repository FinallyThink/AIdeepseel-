const {test}=require('node:test');const assert=require('node:assert/strict');
const {Pipeline}=require('../electron/pipeline.cjs');const {defaults,validate}=require('../electron/settings.cjs');
function create(overrides={}){
 const config={...defaults,roomId:'r',simulation:true,selectionIntervalMs:2000};let saved;
 const settings={config,save:p=>Object.assign(config,p)};
 const ai={select:async es=>es[0]?.id,reply:async e=>e.kind==='gift'?'谢谢，祝你开心':'你好'};
 const speech={render:async()=>'/audio.wav'};
 const p=new Pipeline({settings,ai,speech,persist:d=>saved=structuredClone(d),now:()=>10000,...overrides});return{p,settings,ai,speech,saved:()=>saved};
}
const event=(id,kind='chat')=>({id,kind,room:'r',user:'观众',content:'你好？',gift:'玫瑰',count:1});
test('clear records persists empty queue and history, cleans audio and retains gift deduplication',()=>{
 const{p,saved}=create();const cleaned=[];p.on('cleanup',file=>cleaned.push(file));
 p.ingest(event('g','gift'));p.jobs[0].audio='/gift.wav';p.ingest(event('c'));
 p.history=[{id:'old',event:event('old'),text:'old reply',at:1}];p.error='old error';
 p.clearRecords();
 assert.deepEqual(p.jobs,[]);assert.deepEqual(p.feed,[]);assert.deepEqual(p.candidates,[]);assert.deepEqual(p.history,[]);
 assert.deepEqual(cleaned,['/gift.wav']);assert.equal(p.error,null);assert.equal(p.stats.received,0);
 const restored=create({restored:saved()}).p;assert.deepEqual(restored.jobs,[]);assert.deepEqual(restored.history,[]);
 assert.equal(restored.ingest(event('g','gift')),false);assert.equal(restored.ingest(event('new')),true);
});
test('clear records rejects running, playing and unfinished asynchronous work without losing messages',()=>{
 for(const flag of ['running','current','preparing','selecting']){
  const{p}=create();p.ingest(event('g','gift'));p[flag]=flag==='current'?{id:p.jobs[0].id}:true;
  assert.throws(()=>p.clearRecords(),/请先暂停/);assert.equal(p.jobs.length,1);assert.equal(p.feed.length,1);
 }
});
test('session selection promotes to channel ID and accepts a subsequent broadcast only on that channel',()=>{
 const{p,settings}=create();p.ingest({...event('first'),webRoom:'channel'});assert.equal(settings.config.roomId,'channel');
 assert.equal(p.ingest({...event('next'),room:'new-session',webRoom:'channel'}),true);
 assert.equal(p.ingest({...event('other'),room:'other-session',webRoom:'other-channel'}),false);
 assert.equal(p.candidates.length,2);
});
test('follows persist while paused and deduplicate viewer notifications across restart',()=>{
 const{p,saved}=create();const follow={...event('f','follow'),userId:'u'};
 assert.equal(p.ingest(follow),true);assert.equal(p.jobs.length,1);assert.equal(p.candidates.length,0);assert.equal(p.snapshot().normalCount,0);
 assert.equal(p.ingest({...follow,id:'duplicate'}),false);const restored=create({restored:saved()}).p;assert.equal(restored.jobs[0].event.kind,'follow');
 assert.equal(restored.ingest({...follow,id:'after-restart'}),false);assert.equal(restored.ingest({...follow,id:'other-room',room:'other'}),false);
 assert.equal(restored.ingest({...follow,id:'other-viewer',userId:'v'}),true);
});
test('gift then follow then chat; failed follow AI uses thanks and TTS is retryable',async()=>{
 const{p,ai,speech}=create();p.enqueue(event('c'));p.start();await p.prepare();p.ingest(event('f','follow'));p.setOutput(true);assert.equal(p.current,null);
 p.ingest(event('g','gift'));ai.reply=async()=>{throw Error('offline');};await p.prepare();assert.equal(p.jobs.find(j=>j.id===p.current.id).event.kind,'gift');p.ended(p.current.id);assert.equal(p.current,null);
 p.setOutput(false);speech.render=async()=>{throw Error('voice offline');};await p.prepare();const follow=p.jobs.find(j=>j.event.kind==='follow');assert.equal(follow.state,'failed');assert.match(follow.text,/谢谢观众的关注/);
 speech.render=async()=>'/audio.wav';p.retry(follow.id);await p.prepare();p.setOutput(true);assert.equal(p.current.id,follow.id);p.ended(follow.id);assert.equal(p.jobs.find(j=>j.id===p.current.id).event.kind,'chat');
});
test('entrances bypass selection, rate limit globally and deduplicate each viewer',()=>{
 let now=10000;const{p}=create({now:()=>now});const enter=(id,userId)=>({...event(id,'enter'),userId});
 p.ingest(enter('paused','a'));assert.equal(p.jobs.length,0);p.start();p.setOutput(true);
 p.ingest(enter('one','a'));assert.equal(p.jobs.length,1);assert.equal(p.candidates.length,0);assert.equal(p.snapshot().normalCount,0);
 p.jobs=[];p.ingest(enter('two','b'));assert.equal(p.jobs.length,0);now+=20000;p.ingest(enter('three','a'));assert.equal(p.jobs.length,0);
 p.ingest(enter('four','b'));assert.equal(p.jobs.length,1);p.jobs=[];now+=300000;p.ingest(enter('five','a'));assert.equal(p.jobs.length,1);
});
test('welcome expires without blocking gifts and uses a fallback if AI is unavailable',async()=>{
 let now=10000;const{p,ai}=create({now:()=>now});p.start();p.setOutput(true);p.ingest(event('enter','enter'));p.ingest(event('gift','gift'));
 ai.reply=async()=>{throw Error('offline');};await p.prepare();assert.equal(p.jobs.find(j=>j.id===p.current.id).event.kind,'gift');p.ended(p.current.id);
 await p.prepare();assert.equal(p.current.event,undefined);const welcome=p.jobs.find(j=>j.id===p.current.id);assert.match(welcome.text,/欢迎观众/);p.ended(welcome.id);
 now+=20000;p.ingest({...event('new','enter'),user:'新观众'});now+=60000;await p.prepare();assert.equal(p.jobs.length,0);
});
test('idle speech repeats after completion, pauses, and waits for output and music',async()=>{
 let now=10000;const{p}=create({now:()=>now});p.start();p.setOutput(true);
 now+=29999;await p.tick();assert.equal(p.jobs.length,0);
 now++;await p.tick();assert.equal(p.jobs[0].event.kind,'idle');const id=p.current.id;p.started(id);
 now+=60000;await p.tick();assert.equal(p.jobs.length,1);p.ended(id);
 now+=29999;await p.tick();assert.equal(p.jobs.length,0);now++;await p.tick();assert.equal(p.jobs.length,1);
 p.ended(p.current.id);p.pause();now+=60000;await p.tick();assert.equal(p.jobs.length,0);
 p.start();now+=30000;p.setOutput(false);await p.tick();assert.equal(p.jobs.length,0);
 p.setOutput(true);p.canDispatch=()=>false;await p.tick();assert.equal(p.jobs.length,0);
 p.canDispatch=()=>true;await p.tick();assert.equal(p.jobs.length,1);
});
test('incoming interaction resets idle delay and failed idle attempts stay bounded',async()=>{
 let now=10000;const{p,ai}=create({now:()=>now});p.start();p.setOutput(true);now+=29000;p.ingest(event('c'));p.candidates=[];
 now+=1000;await p.tick();assert.equal(p.jobs.length,0);
 ai.reply=async()=>{throw Error('offline');};now+=30000;await p.tick();assert.equal(p.jobs.length,1);assert.equal(p.jobs[0].state,'failed');
 now+=30000;await p.tick();assert.equal(p.jobs.length,1);assert.equal(p.jobs[0].state,'failed');
});
test('AI selects before enqueuing; 5 ordinary slots include active and failed jobs',async()=>{
 const {p,ai}=create();p.ingest(event('c'));assert.equal(p.jobs.length,0);let selected=0;ai.select=async es=>{selected++;return es[0].id;};p.start();await p.select();assert.equal(selected,1);assert.equal(p.jobs.length,1);
 for(let i=0;i<8;i++)p.enqueue(event('m'+i));assert.equal(p.snapshot().normalCount,5);p.jobs[0].state='failed';assert.equal(p.enqueue(event('full')),false);
});
test('gifts bypass 5-slot limit, persist while paused, and survive restore',()=>{
 const {p,saved}=create();for(let i=0;i<5;i++)p.enqueue(event('c'+i));for(let i=0;i<8;i++)assert.ok(p.ingest(event('g'+i,'gift')));
 assert.equal(p.jobs.length,13);assert.equal(saved().jobs.length,13);assert.equal(p.running,false);
 const restored=create({restored:saved()}).p;assert.equal(restored.jobs.filter(j=>j.event.kind==='gift').length,8);assert.equal(restored.ingest(event('g0','gift')),false);
 assert.throws(()=>restored.remove(restored.jobs.find(j=>j.event.kind==='gift').id),/礼物/);
});
test('text and history remain unpublished until actual playback starts',async()=>{
 const {p}=create();p.ingest(event('g','gift'));p.start();p.setOutput(true);let payload;p.on('play',v=>payload=v);await p.prepare();
 assert.ok(payload.audio);assert.equal(p.history.length,0);assert.equal(p.current.state,'buffering');assert.equal(p.current.text,undefined);
 p.started(payload.id);assert.equal(p.history.length,1);assert.equal(p.current.text,'谢谢，祝你开心');p.ended(payload.id);assert.equal(p.jobs.length,0);assert.equal(p.stats.spoken,1);
});
test('gift AI failure falls back to gratitude and blessing; TTS failure remains retryable',async()=>{
 const {p,ai,speech}=create();ai.reply=async()=>{throw Error('AI offline');};speech.render=async text=>{assert.match(text,/谢谢/);assert.match(text,/祝/);throw Error('voice offline');};
 p.ingest(event('g','gift'));p.start();await p.prepare();const job=p.jobs[0];assert.equal(job.state,'failed');assert.equal(job.fallback,true);assert.equal(p.jobs.length,1);
 speech.render=async()=>'/retry.wav';p.retry(job.id);await p.prepare();assert.equal(job.state,'ready');
});
test('gift wins over already-prefetched ordinary reply',async()=>{
 const {p}=create();p.enqueue(event('c'));p.start();await p.prepare();assert.equal(p.jobs[0].state,'ready');p.ingest(event('g','gift'));p.setOutput(true);assert.equal(p.current,null);
 await p.prepare();assert.equal(p.jobs.find(j=>j.id===p.current.id).event.kind,'gift');
});
test('pause keeps gifts and preparation does not dispatch until resumed',async()=>{
 let finish;const {p,speech}=create();speech.render=()=>new Promise(r=>finish=r);p.ingest(event('g','gift'));p.start();p.setOutput(true);const prep=p.prepare();await new Promise(r=>setImmediate(r));p.pause();finish('/a.wav');await prep;
 assert.equal(p.jobs[0].state,'ready');assert.equal(p.current,null);p.start();assert.ok(p.current);
});
test('display loss retains uncertain playback for explicit retry without duplicate history',async()=>{
 const {p}=create();p.ingest(event('g','gift'));p.start();p.setOutput(true);await p.prepare();const id=p.current.id;p.started(id);p.setOutput(false);assert.equal(p.jobs[0].state,'failed');p.retry(id);p.setOutput(true);p.started(id);assert.equal(p.history.length,1);
});
test('malformed settings rejected; room changes cannot silently discard gifts',()=>{
 assert.deepEqual(validate({collectorUrl:'ws://example.com'}),{});assert.throws(()=>validate({rate:100}));assert.throws(()=>validate({simulation:'true'}));assert.throws(()=>validate({historyCount:2.5}));
 const {p}=create();p.ingest(event('g','gift'));assert.throws(()=>p.changeRoom('new'),/队列/);
});
test('interrupted playback after restart requires explicit retry',()=>{
 const {p,saved}=create();p.ingest(event('g','gift'));p.jobs[0].state='playing';p.changed();const restored=create({restored:saved()}).p;
 assert.equal(restored.jobs[0].state,'failed');assert.match(restored.jobs[0].error,/不确定/);restored.retry(restored.jobs[0].id);assert.equal(restored.jobs[0].state,'queued');
});
test('long-term archive event fires only after successful playback completes',async()=>{
 const{p}=create();let archived=[];p.on('completed',record=>archived.push(record));p.ingest(event('g','gift'));p.start();p.setOutput(true);await p.prepare();const id=p.current.id;
 p.started(id);assert.equal(archived.length,0);p.ended(id,'playback failed');assert.equal(archived.length,0);p.retry(id);p.started(id);p.ended(id);assert.equal(archived.length,1);assert.equal(archived[0].event.kind,'gift');assert.ok(archived[0].text);
});

test('auto chat toggle suppresses idle, clears waiting idle and preserves active speech and interactions',async()=>{
 let now=10000;const{p,settings}=create({now:()=>now});settings.save({autoChatEnabled:false});p.start();p.setOutput(true);
 now+=60000;await p.tick();assert.equal(p.jobs.length,0);
 settings.save({autoChatEnabled:true});await p.tick();const id=p.current.id;p.started(id);
 settings.save({autoChatEnabled:false});await p.tick();assert.equal(p.current.id,id);p.ended(id);
 p.enqueue({...event('waiting'),kind:'idle'});p.ingest(event('gift','gift'));await p.tick();
 assert.equal(p.jobs.some(j=>j.event.kind==='idle'),false);assert.equal(p.jobs.find(j=>j.id===p.current.id).event.kind,'gift');
 assert.deepEqual(validate({autoChatEnabled:false}),{autoChatEnabled:false});assert.throws(()=>validate({autoChatEnabled:'false'}));
});
