const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {Memory}=require('../electron/memory.cjs');const {AI}=require('../electron/ai.cjs');const {defaults}=require('../electron/settings.cjs');
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanjing-memory-'));const settings={config:{...defaults,roomId:'a'},getKey:()=> 'test'};const memory=new Memory(dir,settings);return{dir,settings,memory,close:()=>fs.rmSync(dir,{recursive:true,force:true})};}
const item=(id,room='a',content='喜欢听海洋故事')=>({id,event:{kind:'chat',room,webRoom:room==='a'?'stable-a':'stable-b',userId:'viewer',user:'小鱼',content},text:'下次我们继续讲鲸鱼的故事。',at:Date.now()});
test('all spoken event types survive archival and reload',()=>{
 const {memory,dir,settings,close}=setup();try{
  for(const kind of ['idle','enter','follow','api']){const r=item(kind);r.event.kind=kind;assert.equal(memory.record(r),true);}
  const restored=new Memory(dir,settings);assert.equal(restored.records.length,4);assert.match(restored.context({room:'a'}),/鲸鱼/);
 }finally{close();}
});
test('archives full local documents, deduplicates and reloads beyond recent context',()=>{
 const {memory,dir,settings,close}=setup();try{for(let i=0;i<80;i++)memory.record(item('r'+i));assert.equal(memory.record(item('r0')),false);
 const file=fs.readdirSync(path.join(dir,'sessions')).find(f=>f.endsWith('.md'));assert.match(fs.readFileSync(path.join(dir,'sessions',file),'utf8'),/鲸鱼/);
 const reloaded=new Memory(dir,settings);assert.equal(reloaded.snapshot().total,80);assert.equal(reloaded.record(item('r0')),false);
 assert.match(reloaded.context({room:'a',userId:'viewer',content:'海洋'}),/鲸鱼/);
 }finally{close();}
});
test('room isolation, stable WebRoomId recall, disabled memory and demo exclusion',()=>{
 const{memory,settings,close}=setup();try{memory.record(item('a'));memory.record(item('b','b','其他房间秘密话题'));assert.equal(memory.record(item('d','demo')),false);
 assert.doesNotMatch(memory.context({room:'a'}),/其他房间秘密话题/);assert.match(memory.context({room:'new-session-room',webRoom:'stable-a'}),/鲸鱼/);
 settings.config.memoryEnabled=false;assert.equal(memory.context({room:'a'}),'');settings.config.simulation=true;assert.equal(memory.record(item('s')),false);
 }finally{close();}
});
test('human Markdown edits are read from disk and memory injection respects cap',()=>{
 const{memory,settings,close}=setup();try{settings.config.memoryMaxChars=1000;memory.saveKnowledge('# 手工记忆\n主播喜欢蓝色。\n'+'海'.repeat(6000));memory.record(item('a'));
 const context=memory.context({room:'a'});assert.ok(context.length<=1000);assert.match(context,/主播喜欢蓝色/);assert.match(context,/鲸鱼/);
 fs.writeFileSync(memory.knowledgeFile,'# 外部编辑\n下次聊海豚。');assert.match(memory.context({room:'a'}),/下次聊海豚/);
 assert.throws(()=>memory.saveKnowledge('x'.repeat(20001)),/20000/);
 }finally{close();}
});
test('summary watermark advances only for its snapshot, leaving incoming records pending',async()=>{
 const{memory,close}=setup();try{for(let i=0;i<20;i++)memory.record(item('r'+i));let resolve,inputs;
 const ai={summarizeMemory:(previous,batch)=>{inputs=batch;return new Promise(r=>resolve=r);}};const pending=memory.summarize(ai);assert.equal(memory.busy,true);memory.record(item('during-summary'));resolve('聊到了鲸鱼，约好下次继续。');assert.equal(await pending,true);
 const summary=Object.values(memory.summaries)[0];assert.equal(summary.count,20);assert.equal(inputs.length,20);assert.equal(memory.records.length,21);assert.equal(fs.readdirSync(memory.summaryDir).filter(f=>f.endsWith('.md')).length,1);
 const notes=memory.knowledge();let batch2;await memory.summarize({summarizeMemory:async(prev,batch)=>{batch2=batch;return '继续鲸鱼故事。';}},{force:true});assert.equal(batch2.length,1);assert.equal(memory.knowledge(),notes);assert.equal(Object.values(memory.summaries)[0].count,21);
 }finally{close();}
});
test('failed summary preserves transcripts and prior summary; retry cannot overlap',async()=>{
 const{memory,dir,close}=setup();try{memory.record(item('a'));await memory.summarize({summarizeMemory:async()=> '已有摘要'},{force:true});memory.record(item('b'));
 await assert.rejects(memory.summarize({summarizeMemory:async()=>{throw Error('offline');}},{force:true}),/offline/);
 assert.equal(Object.values(memory.summaries)[0].text,'已有摘要');assert.equal(memory.records.length,2);assert.match(fs.readFileSync(path.join(dir,'sessions',memory.session+'.md'),'utf8'),/鲸鱼/);
 }finally{close();}
});
test('partial log lines are preserved, valid records and Markdown mirror recover',()=>{
 const{memory,dir,settings,close}=setup();try{memory.record(item('r'));const log=path.join(dir,'sessions',memory.session+'.jsonl');fs.appendFileSync(log,'{"interrupted":');fs.unlinkSync(log.replace('.jsonl','.md'));
 const recovered=new Memory(dir,settings);assert.equal(recovered.records.length,1);assert.match(recovered.error,/异常行/);assert.ok(fs.existsSync(log.replace('.jsonl','.md')));assert.match(fs.readFileSync(log,'utf8'),/interrupted/);
 }finally{close();}
});
test('AI receives old memory alongside bounded recent turns for both reply and selection',async()=>{
 const{memory,settings,close}=setup();try{memory.record(item('old'));memory.saveKnowledge('主播约定每周分享海洋故事。');const ai=new AI(settings,memory);let request;
 ai.json=async(system,data)=>{request={system,data};return{text:'你好，小鱼！',id:'candidate'};};await ai.reply(item('current').event,Array.from({length:20},(_,i)=>({text:String(i)})));
 assert.equal(request.data.history.length,10);assert.match(request.data.longTermMemory,/海洋故事/);assert.match(request.system,/历史引用/);
 await ai.select([{id:'candidate',room:'a',content:'海洋'}],[]);assert.match(request.data.longTermMemory,/海洋故事/);
 }finally{close();}
});
