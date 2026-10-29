const {test}=require('node:test');const assert=require('node:assert/strict');
const {Music}=require('../electron/music.cjs');
test('default song loops when idle, yields to requests, resumes and stops when disabled',async()=>{
 const settings={config:{musicEnabled:true,musicDefaultId:'123',musicDefaultLoop:true,simulation:false,roomId:'1'}};
 const provider={find:async query=>({id:query,title:query,artist:'artist'}),resolve:async()=> 'url'};
 const m=new Music({settings,provider,canPlay:()=>true});m.setOutput(true);
 await m.tick();let j=m.queue.find(j=>j.id===m.current);assert.equal(j.isDefault,true);
 m.started(j.id);m.finished(j.id);await m.tick();assert.ok(m.current);assert.notEqual(m.current,j.id);
 m.queue.push({id:'request',query:'456',mode:'live',state:'searching',user:'viewer'});
 await m.tick();assert.equal(m.current,'request');assert.equal(m.queue.some(j=>j.isDefault),false);
 m.finished('request');await m.tick();assert.equal(m.queue.find(j=>j.id===m.current).isDefault,true);
 settings.config.musicDefaultLoop=false;await m.tick();assert.equal(m.current,null);assert.equal(m.queue.length,0);
});
test('unavailable default song backs off rather than retrying every tick',async()=>{
 const m=new Music({settings:{config:{musicEnabled:true,musicDefaultId:'123',musicDefaultLoop:true}},provider:{find:async()=>{throw Error('Unavailable');}},canPlay:()=>true});m.setOutput(true);
 await m.tick();await m.tick();assert.equal(m.queue.length,0);assert.ok(m.defaultRetryAt>Date.now());
});
