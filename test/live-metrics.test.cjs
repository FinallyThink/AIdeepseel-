const {test}=require('node:test');const assert=require('node:assert/strict');
const {LiveMetrics}=require('../electron/live-metrics.cjs');
test('like leaders change only on a strict lead; gift value is counted once as total, not per item',()=>{
 const m=new LiveMetrics();const like=(userId,count)=>m.ingest({room:'1',kind:'like',userId,user:userId,count});
 assert.equal(like('a',3).user,'a');assert.equal(like('b',3),null);assert.equal(like('a',1),null);assert.equal(like('b',2).user,'b');
 m.ingest({room:'1',kind:'gift',count:5,giftFen:123});assert.equal(m.snapshot().rice,1.23);
 m.ingest({room:'1',kind:'gift',giftFen:null});assert.equal(m.snapshot().unknownValueGifts,1);
 m.ingest({room:'2',kind:'like',user:'c',count:1});assert.equal(m.snapshot().rice,0);assert.equal(m.snapshot().leader.user,'c');
});
