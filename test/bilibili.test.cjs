const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeBilibili:n}=require('../electron/bilibili-event.cjs');
const {Collector}=require('../electron/collector.cjs');
test('Bilibili upstream events preserve room, content, gift counts and exclude unsupported events',()=>{
  const chat=n({platform:'bilibili',type:'Chat',data:{name:'观众',content:'你好'}},'123');
  assert.equal(chat.room,'123');assert.equal(chat.kind,'chat');assert.equal(chat.content,'你好');assert.equal(chat.userId,'');
  const gift=n({platform:'bilibili',type:'Gift',data:{name:'观众',item:'花',num:12}},'123');
  assert.equal(gift.count,12);assert.equal(gift.gift,'花');
  assert.equal(n({platform:'bilibili',type:'Gift',data:{num:-1}},'123'),null);
  assert.equal(n({platform:'bilibili',type:'Like',data:{count:3}},'123').count,3);
  assert.equal(n({platform:'抖音',type:'Chat',data:{content:'hello'}},'123').platform,'douyin');
  assert.equal(n({platform:'bilibili',type:'Chat',data:{content:''}},'123'),null);
  assert.throws(()=>new Collector().connectBilibili('https://example.com','python'));
});
