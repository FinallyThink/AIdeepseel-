const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createLocalAPI}=require('../electron/local-api.cjs');
const {Pipeline}=require('../electron/pipeline.cjs');
const {defaults,validate}=require('../electron/settings.cjs');
function pipeline(){return new Pipeline({settings:{config:{...defaults}},ai:{reply:async()=> '生成回复'},speech:{render:async text=>text}});}
test('local API queues direct speech and AI prompts while paused; validates requests',async()=>{
 const p=pipeline(),server=createLocalAPI(p,{port:0});await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}`;
 const post=(data,headers={})=>fetch(url+'/api/speak',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 try{
  assert.equal((await fetch(url+'/health')).status,200);
  const response=await post({text:'你好宝可梦'});assert.equal(response.status,202);assert.equal((await response.json()).id,p.jobs[0].id);
  assert.equal((await post({mode:'reply',text:'聊聊宝可梦'})).status,202);
  assert.equal((await post({text:''})).status,400);
  assert.equal((await post({text:'hi'},{Origin:'https://example.com'})).status,403);
  assert.equal(p.jobs.length,2);p.start();await p.prepare();assert.deepEqual(p.jobs.map(j=>j.text),['你好宝可梦','生成回复']);
 }finally{await new Promise(r=>server.close(r));}
});
test('two preparations overlap; out-of-order completion still plays in order and records spoken text',async()=>{
 const p=pipeline();const resolve=[];p.speech.render=text=>new Promise(r=>resolve.push(()=>r(text)));
 for(let i=0;i<3;i++)p.enqueue({kind:'api',mode:'say',content:'文本'+i,room:'local'});
 p.start();p.setOutput(true);const work=p.prepare();assert.equal(resolve.length,2);
 resolve[1]();await new Promise(r=>setImmediate(r));assert.equal(p.current,null);
 resolve[0]();await work;const first=p.current.id;p.started(first);assert.equal(p.history[0].text,'文本0');p.ended(first);
 assert.equal(p.jobs.find(j=>j.id===p.current.id).text,'文本1');assert.equal(p.jobs[1].state,'queued');
 assert.equal(defaults.speechPreloadCount,2);assert.throws(()=>validate({speechPreloadCount:0}));assert.throws(()=>validate({speechPreloadCount:1.5}));
});
test('urgent gift can prepare when lower-priority preload slots are full',async()=>{
 const p=pipeline();for(let i=0;i<2;i++)p.enqueue({kind:'api',mode:'say',content:'文本',room:'local'});
 p.start();await p.prepare();p.enqueue({kind:'gift',room:'local',user:'观众',gift:'玫瑰',count:1});
 await p.prepare();p.setOutput(true);assert.equal(p.jobs.find(j=>j.id===p.current.id).event.kind,'gift');
});

test('scene snapshots generate commentary and replace queued stale scenes',async()=>{
 const p=pipeline(),server=createLocalAPI(p,{port:0});await once(server,'listening');
 const post=data=>fetch('http://127.0.0.1:'+server.address().port+'/api/scene',{method:'POST',body:JSON.stringify(data)});
 try{
  assert.equal((await post({scene:''})).status,400);
  assert.equal((await post({game:'???',scene:'?????',instruction:'????'})).status,202);
  assert.equal((await post({scene:'???????'})).status,202);
  assert.equal(p.jobs.length,1);assert.equal(p.jobs[0].event.mode,'reply');
  assert.ok(p.jobs[0].event.content.includes('scene'));
  p.start();await p.prepare();assert.ok(p.jobs[0].text);
 }finally{await new Promise(r=>server.close(r));}
});

