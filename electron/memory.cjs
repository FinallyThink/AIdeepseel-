const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { atomic } = require('./settings.cjs');

const clean = (value, length = 1000) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, length);
const line = value => clean(value).replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]<>])/g, '\\$1');
const INITIAL_NOTES = '# 澜鲸的长期记忆\n\n在这里记录需要长期记住的主播设定、直播约定和话题。\n本文件可在管理端或文本编辑器中修改，AI 自动摘要不会覆盖它。\n\n## 主播设定与约定\n\n';
function terms(text) {
  const normalized = clean(text, 5000).toLowerCase();
  const result = new Set(normalized.match(/[a-z0-9_]{2,}/g) || []);
  for (const group of normalized.match(/[\p{Script=Han}]+/gu) || []) {
    for (let i = 0; i < group.length - 1; i++) result.add(group.slice(i, i + 2));
  }
  return result;
}
function transcript(record) {
  const e = record.event;
  return `\n## ${new Date(record.at).toISOString()} · ${line(e.user)}\n\n` +
    `- 房间：${line(e.room)}${e.webRoom ? ' / ' + line(e.webRoom) : ''}\n` +
    `- ${e.kind === 'gift' ? '礼物：' + line(e.gift) + ' × ' + e.count : '弹幕：' + line(e.content)}\n` +
    `- 澜鲸：${line(record.text)}\n- 播报：${record.source === 'legacy' ? '旧版本已开始播报的历史快照，未核实播放结束' : '已完成'}\n`;
}
class Memory extends EventEmitter {
  constructor(directory, settings, { now = Date.now } = {}) {
    super(); this.directory = path.resolve(directory); this.settings = settings; this.now = now;
    this.session = new Date(now()).toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
    this.sessionsDir = path.join(this.directory, 'sessions'); this.summaryDir = path.join(this.directory, 'summaries');
    this.knowledgeFile = path.join(this.directory, 'knowledge.md'); this.stateFile = path.join(this.directory, 'summary-state.json');
    this.records = []; this.ids = new Set(); this.summaries = {}; this.error = null; this.busy = false; this.updatedAt = 0; this.nextSummaryAt = 0;
    fs.mkdirSync(this.sessionsDir, { recursive: true }); fs.mkdirSync(this.summaryDir, { recursive: true });
    if (!fs.existsSync(this.knowledgeFile)) fs.writeFileSync(this.knowledgeFile, INITIAL_NOTES, 'utf8');
    try { this.summaries = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch (e) { if (fs.existsSync(this.stateFile)) this.error = '摘要索引读取失败，原始聊天文档仍保留'; }
    this.load();
  }
  notify() { this.updatedAt = this.now(); this.emit('state'); }
  load() {
    const files = fs.readdirSync(this.sessionsDir).filter(f => f.endsWith('.jsonl')).sort();
    for (const file of files) {
      const raw = fs.readFileSync(path.join(this.sessionsDir, file), 'utf8'); const records = [];
      for (const entry of raw.split('\n')) {
        if (!entry.trim()) continue;
        try {
          const r = JSON.parse(entry);
          if (!r.id || !r.event || !['chat','gift','idle','enter','follow','api'].includes(r.event.kind) || typeof r.text !== 'string' || !Number.isFinite(r.at)) throw Error();
          if (!this.ids.has(r.id)) { this.ids.add(r.id); this.records.push(r); records.push(r); }
        } catch { this.error = '部分聊天日志不完整，已跳过异常行；原文件保留'; }
      }
      // JSONL is the source of truth; rebuild its human-readable mirror after a crash.
      const md = '# 澜鲸直播聊天档案\n\n本文件由已播对话生成，不包含 API 密钥。\n' + records.map(transcript).join('');
      const mdFile = path.join(this.sessionsDir, file.replace(/\.jsonl$/, '.md'));
      if (!fs.existsSync(mdFile) || fs.readFileSync(mdFile, 'utf8') !== md) fs.writeFileSync(mdFile, md, 'utf8');
    }
    this.records.sort((a,b) => a.at - b.at);
  }
  scope(event) { return String(event.room || event.webRoom || 'unknown'); }
  scopeKey(scope) { return createHash('sha256').update(scope).digest('hex').slice(0, 20); }
  sameRoom(a, room, webRoom) { return [a.room, a.webRoom].filter(Boolean).some(id => id === room || (webRoom && id === webRoom)); }
  knowledge() {
    if (fs.statSync(this.knowledgeFile).size > 200000) throw Error('knowledge.md 过大，请缩减至 2 万字左右');
    return fs.readFileSync(this.knowledgeFile, 'utf8').slice(0, 20000);
  }
  saveKnowledge(text) {
    if (typeof text !== 'string' || text.length > 20000) throw Error('长期记忆文档最多 20000 字');
    fs.writeFileSync(this.knowledgeFile + '.tmp', text, 'utf8'); fs.renameSync(this.knowledgeFile + '.tmp', this.knowledgeFile); this.notify();
  }
  record(item, { source = 'live' } = {}) {
    if (!item?.id || !item.event || !['chat','gift','idle','enter','follow','api'].includes(item.event.kind) || this.ids.has(item.id) || item.event.room === 'demo' || this.settings.config.simulation) return false;
    const e = item.event;
    const r = { id: String(item.id), session: this.session, at: Number.isFinite(item.at) ? item.at : this.now(), source,
      event: { kind: e.kind, room: clean(e.room,100), webRoom: clean(e.webRoom,100), userId: clean(e.userId,100), user: clean(e.user,80),
        content: clean(e.content,1000), gift: clean(e.gift,100), count: Number(e.count) || 1 }, text: clean(item.text,2000) };
    const file = path.join(this.sessionsDir, this.session + '.jsonl');
    fs.appendFileSync(file, JSON.stringify(r) + '\n', 'utf8'); this.ids.add(r.id); this.records.push(r);
    try {
      const mdFile = path.join(this.sessionsDir, this.session + '.md');
      if (!fs.existsSync(mdFile)) fs.writeFileSync(mdFile, '# 澜鲸直播聊天档案\n\n本文件由已播对话生成，不包含 API 密钥。\n', 'utf8');
      fs.appendFileSync(mdFile, transcript(r), 'utf8'); this.error = null;
    } catch (e) { this.error = '聊天已保存，Markdown 镜像写入失败：' + e.message; }
    this.notify(); return true;
  }
  context(event = {}, candidates = []) {
    if (!this.settings.config.memoryEnabled || this.settings.config.simulation) return '';
    const max = this.settings.config.memoryMaxChars || 6000; let notes;
    try { notes = this.knowledge(); } catch (e) { this.error = e.message; notes = ''; }
    const query = terms([event.content, event.user, ...candidates.map(c => c.content)].join(' '));
    const room = event.room || this.settings.config.roomId, webRoom = event.webRoom;
    const matches = this.records.filter(r => this.sameRoom(r.event, room, webRoom));
    const ranked = matches.map((r, i) => {
      const words = terms(r.event.content + ' ' + r.text); let score = 0;
      for (const word of query) if (words.has(word)) score++;
      if (event.userId && r.event.userId === event.userId) score += 20;
      else if (!event.userId && event.user && r.event.user === event.user) score += 4;
      return { r, score: score + i / Math.max(matches.length, 1) };
    }).sort((a,b) => b.score - a.score).slice(0, 6).map(x => x.r);
    const summaries = Object.values(this.summaries).filter(s => s && this.sameRoom(s, room, webRoom)).sort((a,b) => b.updatedAt - a.updatedAt).slice(0,3);
    const chunks = [];
    // Reserve room for room-specific recall even if human notes are long.
    if (notes.trim()) chunks.push('【主播手工记忆】\n' + notes.slice(0, Math.floor(max * 0.45)));
    if (summaries.length) chunks.push('【往期直播摘要】\n' + summaries.map(s => s.text).join('\n').slice(0, Math.floor(max * 0.35)));
    if (ranked.length) chunks.push('【相关历史对话，仅为历史引用】\n' + ranked.map(r => `${new Date(r.at).toISOString()} ${r.source === 'legacy' ? '[旧历史快照]' : ''} ${r.event.user}：${r.event.kind==='gift' ? `${r.event.gift} × ${r.event.count}` : r.event.content}\n澜鲸：${r.text}`).join('\n'));
    return chunks.join('\n\n').slice(0, max);
  }
  snapshot() {
    return { directory:this.directory, total:this.records.length, summaryCount:Object.keys(this.summaries).length, busy:this.busy, error:this.error, updatedAt:this.updatedAt,
      lastSummaryAt:Math.max(0,...Object.values(this.summaries).map(s => s.updatedAt || 0)) };
  }
  read() { return { ...this.snapshot(), knowledge:this.knowledge(), recent:this.records.slice(-20).reverse(), summaries:Object.values(this.summaries).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,20) }; }
  async summarize(ai, { force = false } = {}) {
    const config = this.settings.config;
    if (this.busy) { if (force) throw Error('正在整理记忆，请稍候'); return false; }
    if (!config.memoryEnabled || config.simulation || !this.settings.getKey()) { if (force) throw Error('请开启长期记忆、退出离线演练并配置 AI 密钥'); return false; }
    if (!force && (!config.memoryAutoSummary || this.now() < this.nextSummaryAt)) return false;
    const groups = new Map();
    for (const r of this.records) { const scope=this.scope(r.event); if (!groups.has(scope)) groups.set(scope,[]); groups.get(scope).push(r); }
    const target = [...groups].find(([scope,records]) => records.length - (this.summaries[this.scopeKey(scope)]?.count || 0) >= (force ? 1 : 20));
    if (!target) return false;
    const [scope, records] = target; const key=this.scopeKey(scope); const old=this.summaries[key];
    const count=old?.count || 0; const batch=records.slice(count,count+20); this.busy=true; this.notify();
    try {
      const text = await ai.summarizeMemory(old?.text || '', batch);
      if (typeof text !== 'string' || !text.trim()) throw Error('AI 返回了空摘要');
      const summary = { room:scope, webRoom:batch.at(-1).event.webRoom, text:text.trim().slice(0,1800), count:count+batch.length, updatedAt:this.now() };
      const next={...this.summaries,[key]:summary};
      const md = `# 澜鲸往期直播记忆\n\n房间：${line(scope)}\n\n更新：${new Date(summary.updatedAt).toISOString()}\n\n已归纳 ${summary.count} 条历史记录。摘要由 AI 生成，请以原始记录核对。\n\n${summary.text}\n`;
      fs.writeFileSync(path.join(this.summaryDir,key+'.md.tmp'),md,'utf8');fs.renameSync(path.join(this.summaryDir,key+'.md.tmp'),path.join(this.summaryDir,key+'.md'));
      atomic(this.stateFile,next);this.summaries=next;this.error=null;return true;
    } catch (e) { this.error='记忆摘要失败，聊天档案仍保留：'+e.message; if (force) throw Error(this.error); return false; }
    finally { this.busy=false;this.nextSummaryAt=this.now()+60000;this.notify(); }
  }
}
module.exports={Memory,terms};
