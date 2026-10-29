import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Assistant, Bridge, normalize, parsePacket, localUrl } from '../src/bridge.js';
const cfg = () => ({ enabled: true, roomId: 'r', replyChat: true, thankGifts: true, blockedWords: [], maxQueue: 2, minIntervalMs: 10, chatMaxAgeMs: 100, giftMaxAgeMs: 1000 });
const packet = (id, type = 1, extra = {}) => ({ Type: type, Data: { MsgId: id, RoomId: 'r', User: { Id: 'u', Nickname: '小鱼' }, Content: '你好', GiftName: '小心心', GiftCount: 1, ...extra } });
test('follow packets are distinct from chat, entrances and gifts',()=>{
 const e=normalize(packet('follow',4,{Content:''}));assert.equal(e.kind,'follow');assert.equal(e.content,'关注了主播');assert.equal(e.userId,'u');
 assert.equal(normalize(packet('self-follow',4,{User:{IsAnchor:true}})),null);
 const b=new Bridge(cfg(),{},()=>{});assert.equal(b.accept(packet('follow',4)),false);
});
test('entrance packets normalize without chat content and exclude anchors and statistics',()=>{
 const e=normalize(packet('enter',3,{Content:''}));assert.equal(e.kind,'enter');assert.equal(e.user,'小鱼');assert.equal(e.content,'进入直播间');
 assert.equal(normalize(packet('anchor',3,{User:{IsAnchor:true}})),null);assert.equal(normalize(packet('stats',6)),null);
 const b=new Bridge(cfg(),{},()=>{});assert.equal(b.accept(packet('legacy',3)),false);
});
test('supports string Data and preserves 64-bit message IDs', () => {
  const e = normalize('{"Type":1,"Data":"{\\"MsgId\\":7338697347818230818,\\"RoomId\\":\\"r\\",\\"Content\\":\\"hi\\"}"}');
  assert.equal(e.id, '7338697347818230818');
  assert.equal(parsePacket('{"Id":7338697347818230819}').Id, '7338697347818230819');
});
test('filters rooms, anchors and duplicate messages', () => {
  const b = new Bridge(cfg(), {}, () => {});
  assert.equal(b.accept(packet('1', 1, { RoomId: 'other' })), false);
  assert.equal(b.accept(packet('2', 1, { User: { IsAnchor: true } })), false);
  assert.equal(b.accept(packet('3')), true); assert.equal(b.accept(packet('3')), false);
  b.pause(); assert.equal(b.queue.length, 0); assert.equal(b.accept(packet('4')), false);
});
test('gifts preempt chat and combine incremental quantities', async () => {
  const sent = []; const b = new Bridge(cfg(), { send: async e => { sent.push(e); return {}; } }, () => {});
  b.accept(packet('1')); b.accept(packet('2'));
  b.accept(packet('3', 5, { GiftCount: 2, RepeatCount: 2 }));
  b.accept(packet('4', 5, { GiftCount: 1, RepeatCount: 3 }));
  await b.tick(); assert.equal(sent[0].kind, 'gift'); assert.equal(sent[0].count, 3);
});
test('expired chat is skipped; failed delivery is never automatically repeated', async () => {
  let now = 0, count = 0; const b = new Bridge(cfg(), { send: async () => { count++; throw Error('timeout'); } }, () => {}, () => now);
  b.accept(packet('1')); now = 200; await b.tick(); assert.equal(count, 0);
  b.accept(packet('2', 5)); await b.tick(); now += 20; await b.tick(); assert.equal(count, 1); assert.equal(b.stats.failed, 1);
});
test('one request at a time even when ticks overlap', async () => {
  let done, count = 0; const b = new Bridge(cfg(), { send: () => { count++; return new Promise(resolve => { done = resolve; }); } }, () => {});
  b.accept(packet('1')); b.accept(packet('2')); const work = b.tick(); await b.tick(); assert.equal(count, 1); done({}); await work;
});
test('local URLs only', () => {
  assert.throws(() => localUrl('http://example.com', 'http:'));
  assert.throws(() => localUrl('http://x:y@localhost', 'http:'));
});
test('real HTTP adapter reads token and uses desktop assistant chat contract', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'liveai-')); const tokenFile = join(dir, 'token'); await writeFile(tokenFile, 'test-token');
  let request;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    request = { url: req.url, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks)) };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ reply: { text: '你好！' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const a = new Assistant({ assistantUrl: `http://127.0.0.1:${server.address().port}`, tokenFile });
    const result = await a.send(normalize(packet('1')));
    assert.equal(result.reply.text, '你好！'); assert.equal(request.url, '/v1/chat'); assert.equal(request.auth, 'Bearer test-token');
    assert.deepEqual(Object.keys(request.body), ['message']); assert.match(request.body.message, /小鱼/);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true }); }
});
