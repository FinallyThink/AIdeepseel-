const {test}=require('node:test');const assert=require('node:assert/strict');
const {insertDialogue}=require('../electron/admin-dialogue.cjs');
const {Pipeline}=require('../electron/pipeline.cjs');const {defaults}=require('../electron/settings.cjs');
test('admin dialogue queues an AI reply while paused without candidate selection and preserves text on rejection',async()=>{
  const p=new Pipeline({settings:{config:{...defaults,roomId:'123'}},ai:{reply:async e=>'reply: '+e.content},speech:{render:async t=>t}});
  const result=insertDialogue(p,' hello ');assert.equal(p.jobs[0].id,result.id);assert.equal(p.jobs[0].event.user,'管理员');assert.equal(p.jobs[0].event.mode,'reply');assert.equal(p.jobs[0].event.content,'hello');assert.equal(p.candidates.length,0);
  assert.throws(()=>insertDialogue(p,'  '));assert.throws(()=>insertDialogue(p,'x'.repeat(2001)));assert.equal(p.jobs.length,1);
  p.start();await p.prepare();assert.equal(p.jobs[0].text,'reply: hello');
});
