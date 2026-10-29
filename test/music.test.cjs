const{test}=require('node:test');const assert=require('node:assert/strict');const{Music,bindMusic,command}=require('../electron/music.cjs');const{Netease,allowedAudio,songId}=require('../electron/netease.cjs');const{Pipeline}=require('../electron/pipeline.cjs');const{defaults}=require('../electron/settings.cjs');
const gift=(extra={})=>({id:'gift',kind:'gift',room:'r',webRoom:'stable-r',userId:'123',user:'小鱼',count:1,...extra});
const chat=(extra={})=>({id:'chat',kind:'chat',room:'r',webRoom:'stable-r',userId:'123',user:'小鱼',content:'点歌 海风',...extra});
function setup(restored={}){const settings={config:{...defaults,roomId:'r'},getKey:()=>'',save(patch){Object.assign(this.config,patch);}};let saved,time=100000;const provider={find:async()=>({id:'12345',title:'海风',artist:'测试歌手',duration:30000}),resolve:async()=> 'https://m1.music.126.net/audio.mp3',detail:async id=>({id,title:'海风',artist:'测试歌手'})};const music=new Music({settings,provider,restored,persist:s=>saved=structuredClone(s),now:()=>time});return{music,provider,settings,saved:()=>saved,advance:ms=>time+=ms};}
test('song commands and explicit IDs parse without accepting arbitrary site links',()=>{assert.equal(command('点歌：海风'),'海风');assert.equal(command('#点歌 海风 / 小鲸'),'海风 / 小鲸');assert.equal(command('我想点歌啊'),null);assert.equal(songId('https://music.163.com/#/song?id=12345'),'12345');assert.equal(songId('https://evil.test/song?id=12345'),null);assert.throws(()=>allowedAudio('https://music.126.net.evil.test/a'));assert.throws(()=>allowedAudio('http://127.0.0.1/a'));assert.equal(allowedAudio('http://m1.music.126.net/a'),'https://m1.music.126.net/a');});
test('only stable donor ID in the same room qualifies; nickname cannot impersonate, eligibility persists',()=>{
 const{music,saved,settings}=setup();assert.equal(music.handleChat(chat()),true);assert.equal(music.queue.length,0);assert.equal(music.grant(gift({count:0})),false);music.grant(gift());assert.equal(music.eligible(chat()),true);assert.equal(music.eligible(chat({userId:'other'})),false);assert.equal(music.eligible(chat({room:'new',webRoom:'stable-r'})),true);assert.equal(music.eligible(chat({room:'other',webRoom:'stable-other'})),false);
 const restored=setup(saved()).music;assert.equal(restored.eligible(chat()),true);settings.config.simulation=true;assert.equal(music.eligible(chat()),false);
});
test('donors can request without consuming entitlement, one active song per user and 30-second cooldown',async()=>{
 const{music,advance}=setup();music.grant(gift());music.handleChat(chat());music.handleChat(chat({id:'spam'}));assert.equal(music.queue.length,1);await music.prepare();assert.equal(music.queue[0].state,'ready');assert.equal(music.eligible(chat()),true);
 music.remove(music.queue[0].id);music.handleChat(chat());assert.equal(music.queue.length,0);advance(30000);music.handleChat(chat());assert.equal(music.queue.length,1);
});
test('unavailable song stays failed for retry; source URLs never persist or appear in renderer state',async()=>{
 const{music,provider,saved}=setup();music.grant(gift());music.handleChat(chat());provider.resolve=async()=>{throw Error('会员限制');};await music.prepare();assert.equal(music.queue[0].state,'failed');assert.match(music.queue[0].error,/会员/);assert.equal(music.eligible(chat()),true);provider.resolve=async()=> 'https://m1.music.126.net/audio.mp3';music.retry(music.queue[0].id);await music.prepare();assert.equal(music.queue[0].state,'ready');assert.equal('url'in saved().queue[0],false);assert.equal('url'in music.snapshot().queue[0],false);
 const restored=setup({...saved(),queue:saved().queue.map(j=>({...j,state:'playing'}))}).music;assert.equal(restored.queue[0].state,'failed');
});
test('background music and voice play concurrently; song commands bypass ordinary candidate pool',async()=>{
 const{music,settings}=setup();const p=new Pipeline({settings,ai:{reply:async()=> '你好',select:async()=>null},speech:{render:async()=>'/voice.wav'}});bindMusic(p,music);p.setOutput(true);music.setOutput(true);
 p.ingest(gift());p.ingest(chat());assert.equal(p.candidates.length,0);await music.prepare();p.start();await p.prepare();const giftId=p.current.id;p.started(giftId);
 music.dispatch();assert.ok(music.current);const songId=music.current;music.started(songId);assert.equal(p.current.id,giftId);assert.equal('url'in music.snapshot().current,false);p.ended(giftId);
 p.enqueue({kind:'chat',id:'normal',room:'r',user:'小鱼',content:'你好'});await p.prepare();assert.ok(p.current);assert.equal(p.canDispatch(),true);assert.equal(music.current,songId);const replyId=p.current.id;music.pause();assert.equal(p.canDispatch(),true);music.finished(songId);assert.equal(p.current.id,replyId);assert.equal(p.pet().food,20);
});
test('display interruption retains song, pause/resume controls and stale acknowledgements are safe',async()=>{
 const{music}=setup();music.grant(gift());music.handleChat(chat());await music.prepare();music.canPlay=()=>true;music.setOutput(true);music.dispatch();const id=music.current;music.started(id);music.pause();assert.equal(music.snapshot().current.state,'paused');music.pause();music.started(id);assert.equal(music.snapshot().current.state,'playing');music.setOutput(false);assert.equal(music.current,null);assert.equal(music.queue[0].state,'failed');music.finished(id);assert.equal(music.queue.length,1);
});
test('turning off song requests with a ready song cannot block ordinary replies',async()=>{
 const{music,settings}=setup();const p=new Pipeline({settings,ai:{reply:async()=> '你好'},speech:{render:async()=>'/voice.wav'}});bindMusic(p,music);music.grant(gift());music.handleChat(chat());await music.prepare();settings.config.musicEnabled=false;
 p.setOutput(true);p.enqueue({kind:'chat',id:'reply',room:'r',user:'观众',content:'你好'});p.start();await p.prepare();assert.ok(p.current);assert.equal(music.current,null);
});
test('NetEase rejects trials and off-domain audio and does not silently choose covers',async()=>{
 const n=new Netease();n.json=async()=>({data:[{id:1,code:200,url:'https://m1.music.126.net/a',freeTrialInfo:{start:0}}]});await assert.rejects(n.resolve('1'),/完整/);n.json=async()=>({data:[{id:1,code:200,url:'https://evil.test/a'}]});await assert.rejects(n.resolve('1'),/官方/);n.search=async()=>[{id:'1',title:'海风（翻唱版）',artist:'别人'}];await assert.rejects(n.find('海风'),/准确匹配/);
});
test('NetEase stream validates CDN and preserves byte-range responses without downloading to disk',async()=>{
 let request;const n=new Netease({fetchImpl:async(url,options)=>{request={url,options};return new Response(new Uint8Array([1,2]),{status:206,headers:{'content-type':'audio/mpeg','content-range':'bytes 0-1/10'}});}});const r=await n.stream('http://m1.music.126.net/a','bytes=0-1');assert.equal(request.url,'https://m1.music.126.net/a');assert.equal(request.options.headers.Range,'bytes=0-1');assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,2);
});
