import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Assistant, Bridge, localUrl, parsePacket } from './bridge.js';

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
for (const key of ['minIntervalMs', 'chatMaxAgeMs', 'giftMaxAgeMs', 'maxQueue']) {
  if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new Error(`配置 ${key} 必须为正整数`);
}
if (!Array.isArray(config.blockedWords) || typeof config.roomId !== 'string') throw new Error('无效的过滤配置');
localUrl(config.collectorUrl, 'ws:');
const demo = process.argv.includes('--demo');
const log = message => console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${message}`);
const assistant = demo ? { send: async e => ({ reply: { text: `演示：已处理${e.kind === 'gift' ? '礼物感谢' : '弹幕回复'}，未调用桌面助理` } }) } : new Assistant(config);
if (demo) { config.roomId = 'demo'; config.enabled = true; }
const bridge = new Bridge(config, assistant, log);
let socket, reconnect, stopping = false, source = '未连接', lastPacket = null;
const rooms = new Map();
function connect() {
  if (stopping || demo) return;
  source = '连接中'; socket = new WebSocket(config.collectorUrl);
  const timeout = setTimeout(() => socket.close(), 8000);
  socket.addEventListener('open', () => { clearTimeout(timeout); source = '已连接'; log('弹幕采集器已连接，等待直播间数据'); });
  socket.addEventListener('message', async ({ data }) => {
    try {
      const raw = typeof data === 'string' ? data : data instanceof Blob ? await data.text() : Buffer.from(data).toString();
      if (Buffer.byteLength(raw) > 262144) throw new Error('采集消息过大');
      const packet = parsePacket(raw); const d = typeof packet.Data === 'string' ? parsePacket(packet.Data) : packet.Data;
      if (d?.RoomId) {
        const id = String(d.RoomId); if (rooms.size >= 100 && !rooms.has(id)) rooms.delete(rooms.keys().next().value);
        if (!rooms.has(id)) log(`发现直播间：RoomId=${id} WebRoomId=${d.WebRoomId || '无'} 标题=${d.RoomTitle || '未知'}。输入 room ${id} 选择`);
        rooms.set(id, { webRoomId: d.WebRoomId, title: d.RoomTitle });
      }
      lastPacket = new Date().toISOString(); bridge.accept(packet);
    } catch (error) { log('采集消息无法解析 · ' + error.message); }
  });
  socket.addEventListener('error', () => { source = '连接失败'; });
  socket.addEventListener('close', () => { clearTimeout(timeout); source = '未连接'; if (!stopping) reconnect = setTimeout(connect, 5000); });
}
const timer = setInterval(() => void bridge.tick(), 250);
const rl = createInterface({ input: process.stdin, output: process.stdout });
log('直播 AI · ' + (demo ? '离线演示' : '本机模式'));
console.log('命令：status 状态 | rooms 房间 | room <房间ID> 选择并清空队列 | start 开始 | pause 暂停 | check 检查助手 | quit 退出');
if (!demo) log('请先运行弹幕采集器和桌面助理。收到房间数据后选择 room，再输入 start。');
rl.on('line', async line => {
  const [cmd, ...parts] = line.trim().split(/\s+/);
  try {
    if (cmd === 'status') console.log({ source, lastPacket, room: config.roomId, enabled: bridge.enabled, active: bridge.active, queue: bridge.queue.length, ...bridge.stats, error: bridge.error });
    else if (cmd === 'rooms') console.log(Object.fromEntries(rooms));
    else if (cmd === 'room' && parts.length === 1) { bridge.pause(); config.roomId = parts[0]; log('已选择房间 ' + config.roomId + '；输入 start 开始'); }
    else if (cmd === 'start') { if (!config.roomId) throw new Error('请先用 room <房间ID> 选择直播间'); bridge.enabled = true; log('自动回复已开启'); }
    else if (cmd === 'pause') bridge.pause();
    else if (cmd === 'check') { if (demo) log('演示模式不访问助手'); else console.log(await assistant.request('/health')); }
    else if (cmd === 'quit') shutdown();
    else if (cmd) log('未知命令');
  } catch (error) { log(error.message); }
});
function shutdown() { stopping = true; clearTimeout(reconnect); clearInterval(timer); socket?.close(); rl.close(); if (!bridge.active) process.exit(0); else { log('退出中，等待当前回复完成'); const t = setInterval(() => { if (!bridge.active) { clearInterval(t); process.exit(0); } }, 250); } }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
connect();
if (demo) {
  bridge.accept({ Type: 1, Data: { MsgId: 'demo-chat', RoomId: 'demo', User: { Nickname: '小鱼' }, Content: '你好，今天播什么？' } });
  bridge.accept({ Type: 5, Data: { MsgId: 'demo-gift', RoomId: 'demo', User: { Nickname: '星星' }, GiftName: '小心心', GiftCount: 3 } });
}
