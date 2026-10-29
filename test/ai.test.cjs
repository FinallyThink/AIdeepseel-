const {test}=require('node:test');const assert=require('node:assert/strict');const{AI}=require('../electron/ai.cjs');const{defaults}=require('../electron/settings.cjs');
function ai(){return new AI({config:{...defaults},getKey:()=>''});}
test('session topic and activity reach regular and proactive replies',async()=>{
 const a=ai();a.settings.config.liveTopic='宝可梦之夜';a.settings.config.liveActivity='一边打宝可梦一边直播';
 a.json=async system=>{assert.match(system,/宝可梦之夜/);assert.match(system,/一边打宝可梦一边直播/);return{text:'一起冒险吧'};};
 await a.reply({kind:'chat',content:'你好'},[]);await a.reply({kind:'idle'},[]);
});
test('follow thanks mention both viewer and follow and reject generic replies',async()=>{
 const a=ai();a.json=async()=>({text:'谢谢小鱼的关注，愿你今天开心！'});assert.equal(await a.reply({kind:'follow',user:'小鱼'},[]),'谢谢小鱼的关注，愿你今天开心！');
 for(const text of ['谢谢关注','小鱼你好','欢迎小鱼关注']){a.json=async()=>({text});assert.match(await a.reply({kind:'follow',user:'小鱼'},[]),/谢谢小鱼的关注/);}
});
test('entrance welcomes mention the viewer and fall back when their name is missing',async()=>{const a=ai();a.json=async()=>({text:'欢迎小鱼，来这里轻松聊聊吧！'});assert.match(await a.reply({kind:'enter',user:'小鱼'},[]),/欢迎小鱼/);a.json=async()=>({text:'你好'});assert.match(await a.reply({kind:'enter',user:'小鱼'},[]),/欢迎小鱼/);});
function transport(responses){const a=new AI({config:{...defaults},getKey:()=>'test'});const calls=[];a.request=async(url,options)=>{calls.push(JSON.parse(options.body));return{ok:true,json:async()=>{const next=responses.shift();if(next instanceof Error)throw next;return next;}};};return{a,calls};}
const completion=(content,finish_reason='stop')=>({choices:[{message:{content},finish_reason}]});
test('live requests disable thinking and escape empty JSON mode on retry',async()=>{
 const{a,calls}=transport([completion(''),completion('{"text":"晚上好"}')]);
 assert.deepEqual(await a.json('只输出 JSON {"text":"回复"}',{}),{text:'晚上好'});
 assert.equal(calls.length,2);for(const call of calls)assert.deepEqual(call.thinking,{type:'disabled'});
 assert.equal(calls[0].response_format.type,'json_object');assert.equal(calls[1].response_format.type,'text');assert.match(calls[1].messages[0].content,/完整的 JSON/);
});
test('reasoning-only responses are never spoken or parsed as final answers',async()=>{
 const response={choices:[{message:{content:'',reasoning_content:'{"text":"内部思考"}'},finish_reason:'stop'}]};
 const{a}=transport([response,response]);await assert.rejects(a.json('JSON',{}),/仅返回了思考内容/);
});
test('incomplete model JSON retries once with more output space',async()=>{const{a,calls}=transport([completion('{"text":"半句'),completion('{"text":"完整回复"}')]);assert.deepEqual(await a.json('JSON',{}),{text:'完整回复'});assert.equal(calls.length,2);assert.ok(calls[1].max_tokens>calls[0].max_tokens);});
test('empty HTTP JSON and token truncation retry without exposing parser errors',async()=>{
 for(const bad of [new SyntaxError('Unexpected end of JSON input'),completion(''),completion('{"text":"被截断"}','length'),completion('null')]){
 const{a,calls}=transport([bad,bad]);await assert.rejects(a.json('JSON',{}),/自动重试后仍失败/);assert.equal(calls.length,2);
 }
});
test('complete fenced JSON is accepted',async()=>{const{a}=transport([completion('```json\n{"text":"你好"}\n```')]);assert.deepEqual(await a.json('JSON',{}),{text:'你好'});});
test('idle speech uses a proactive prompt and respects length limits',async()=>{const a=ai();a.json=async(system)=>{assert.match(system,/不要假装收到弹幕/);return{text:'鲸'.repeat(200)};};assert.equal((await a.reply({kind:'idle'},[])).length,100);});
test('AI picker may select only a supplied candidate ID',async()=>{const a=ai();a.json=async()=>({id:'invented'});assert.equal(await a.select([{id:'real',content:'hello'}],[]),null);a.json=async()=>({id:'real'});assert.equal(await a.select([{id:'real'}],[]),'real');});
test('gift reply has deterministic gratitude and blessing if model omits them',async()=>{const a=ai();a.json=async()=>({text:'你好'});const r=await a.reply({kind:'gift',user:'小鱼',gift:'玫瑰',count:2},[]);assert.match(r,/小鱼/);assert.match(r,/2个玫瑰/);assert.match(r,/祝/);});
test('normal replies respect configured character limit',async()=>{const a=ai();a.json=async()=>({text:'好'.repeat(200)});assert.equal((await a.reply({kind:'chat'},[])).length,100);});
