const fs = require('node:fs');
const path = require('node:path');
const OLD_PERSONALITY='温柔、聪明、自然，带一点俏皮。你叫澜鲸，是蓝鲸主题的虚拟主播。';
const PREVIOUS_DEFAULT_PERSONALITY='你叫澜鲸，是一位成年、蓝鲸主题的海洋系 AI 虚拟主播，自称澜鲸或小鲸。你有深蓝渐变长发和鲸鳍发饰，喜欢海盐饭团、海洋故事和听观众分享日常。性格温柔聪明、自然亲切，带一点俏皮和小吃货属性，说话像熟悉的朋友，短句为主，不刻意撒娇，不重复口头禅。饭量是直播互动能量，开心值是陪伴氛围；可结合程序提供的真实状态轻松表达饱足、开心或想吃饭团，但不能捏造状态，饭量为零也继续友善回应。收到礼物真诚感谢并送上具体温暖的祝福，不索要礼物，不因付费多少区别尊重，不用饥饿或失落施压观众。记得聊过的话题，适时用海洋比喻；可以说“把烦恼交给海风吧”，但不每条都说。承认自己是 AI，不假装真人或承诺线下关系，遇到不知道的事坦诚说明。';
const DEFAULT_PERSONALITY=PREVIOUS_DEFAULT_PERSONALITY.replace(/饭量是直播互动能量，开心值是陪伴氛围；[^。]*。/g,'');
const defaults = {
  livePlatform:'douyin', collectorPython:'C:/Users/99785/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe', petIdleAction:'',petThinkAction:'',petSpeakAction:'',characterModel:'lanjing', roomId: '', model: 'deepseek-flash',
  selectionIntervalMs: 8000, candidateAgeMs: 60000, replyMaxChars: 100, rate: 1, volume: 0.8, voice: '',
  personality: DEFAULT_PERSONALITY,
  autoChatEnabled: true, speechPreloadCount: 2, liveTopic: '', liveActivity: '',
  title: '今夜，与澜鲸一起遨游', subtitle: '听见每一份心意，让陪伴慢慢发生',
  displayLayout:JSON.stringify(require('../renderer/default-layout.json')), background: '', theme: 'ocean', characterScale: 100, showContext: true, historyCount: 6, simulation: false,
  memoryEnabled: true, memoryAutoSummary: true, memoryMaxChars: 6000,
  initialFood:20,initialHappiness:50,musicEnabled:true,musicVolume:0.5,musicDefaultId:'',musicDefaultLoop:false
};
function validate(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('设置格式错误');
  for (const [key, value] of Object.entries(input)) {
    if(key==='collectorUrl')continue;
    if (!(key in defaults)) throw Error('未知设置：' + key);
    if (typeof value !== typeof defaults[key]) throw Error('设置类型错误：' + key);
    out[key] = value;
  }
  const c = { ...defaults, ...out };
  if(!['lanjing','dsh-pet'].includes(c.characterModel))throw Error('Invalid character model');
  if(!['douyin','bilibili'].includes(c.livePlatform))throw Error('直播平台无效');
  if(!c.collectorPython.trim())throw Error('Python 路径不能为空');
  const actions=require('../renderer/dsh-actions.json');
  for(const key of ['petIdleAction','petThinkAction','petSpeakAction'])if(c[key]&&!(c[key]==='random'&&key!=='petSpeakAction')&&!actions.some(a=>a.id===c[key]))throw Error('无效动作：'+key);
  let layout;try{layout=JSON.parse(c.displayLayout);}catch{throw Error('展示布局格式错误');}
  if(!layout||!['chat,model,music','chat,likes,model,music,rice'].includes(Object.keys(layout).sort().join(',')))throw Error('展示组件错误');
  for(const b of Object.values(layout)){if(!b||typeof b.visible!=='boolean')throw Error('组件可见性错误');for(const k of ['x','y','width','height'])if(!Number.isFinite(b[k])||b[k]<0||b[k]>100)throw Error('布局范围错误');if(b.width<5||b.height<5||b.x+b.width>100.001||b.y+b.height>100.001)throw Error('组件不能超出画布');}
  if(c.musicDefaultId&&!/^\d{1,20}$/.test(c.musicDefaultId))throw Error('默认歌曲请填写网易云歌曲数字 ID');
  for (const [key, min, max] of [['speechPreloadCount',1,8],['selectionIntervalMs',2000,120000],['candidateAgeMs',10000,300000],['replyMaxChars',30,300],['rate',0.5,2],['volume',0,1],['musicVolume',0,1],['characterScale',60,150],['historyCount',2,12],['memoryMaxChars',1000,16000],['initialFood',0,1000000],['initialHappiness',0,1000000]]) {
    if (!Number.isFinite(c[key]) || c[key] < min || c[key] > max) throw Error(`${key} 超出范围 ${min}–${max}`);
  }
  for (const key of ['speechPreloadCount','selectionIntervalMs','candidateAgeMs','replyMaxChars','characterScale','historyCount','memoryMaxChars','initialFood','initialHappiness']) if (!Number.isInteger(c[key])) throw Error(key + ' 必须为整数');
  for (const key of ['liveTopic','liveActivity','roomId','model','voice','title','subtitle','personality','background']) if (c[key].length > (key === 'background' ? 1000 : 500)) throw Error(key + ' 太长');
  if (!['deepseek-flash','deepseek-v4-pro'].includes(c.model)) throw Error('请选择支持的 AI 模型');
  if (!['ocean','night','green'].includes(c.theme)) throw Error('背景主题错误');
  return out;
}
function atomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); fs.renameSync(file + '.tmp', file); }
class Settings {
  constructor(directory, safeStorage) {
    this.directory = directory; this.safeStorage = safeStorage; this.file = path.join(directory,'settings.json'); this.keyFile = path.join(directory,'api-key.bin'); this.config = { ...defaults }; this.key = '';
    try { Object.assign(this.config, validate(JSON.parse(fs.readFileSync(this.file,'utf8')))); } catch {}
    if([OLD_PERSONALITY,PREVIOUS_DEFAULT_PERSONALITY].includes(this.config.personality))this.config.personality=DEFAULT_PERSONALITY;
    try { this.key = safeStorage.decryptString(fs.readFileSync(this.keyFile)); } catch {}
  }
  describe() { return { ...this.config, configured: Boolean(this.key || process.env.DEEPSEEK_API_KEY) }; }
  save(patch) { const valid = validate(patch); atomic(this.file, { ...this.config, ...valid }); Object.assign(this.config,valid); return this.describe(); }
  getKey() { return this.key || process.env.DEEPSEEK_API_KEY || ''; }
  setKey(key) {
    if (typeof key !== 'string' || !/^sk-[A-Za-z0-9_-]{12,240}$/.test(key.trim())) throw Error('请输入有效的 DeepSeek API Key');
    if (!this.safeStorage.isEncryptionAvailable()) throw Error('系统加密不可用，未保存密钥');
    fs.mkdirSync(this.directory, { recursive:true }); fs.writeFileSync(this.keyFile,this.safeStorage.encryptString(key.trim())); this.key = key.trim();
  }
}
module.exports = { Settings, defaults, validate, atomic,DEFAULT_PERSONALITY };
