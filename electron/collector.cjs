const { EventEmitter }=require('node:events');
const fs=require('node:fs');const path=require('node:path');
// 采集器诊断日志：连接、每条原始消息、解析结果、入库结果，写入 artifacts/collector-debug.log。
// 默认开启（联调期），设 LANJING_COLLECTOR_LOG=0 可关闭；单文件超过 2MB 自动轮转。
const DEBUG_ENABLED=process.env.LANJING_COLLECTOR_LOG!=='0';
const DEBUG_LOG=process.env.LANJING_COLLECTOR_LOG_FILE||path.join(__dirname,'..','artifacts','collector-debug.log');
const DEBUG_MAX=2*1024*1024;
function dbg(text){
  if(!DEBUG_ENABLED)return;
  try{
    const d=new Date();
    const line=d.toTimeString().slice(0,8)+'.'+String(d.getMilliseconds()).padStart(3,'0')+' '+text+'\n';
    let size=0;try{size=fs.statSync(DEBUG_LOG).size;}catch{}
    if(size>DEBUG_MAX){try{fs.renameSync(DEBUG_LOG,DEBUG_LOG+'.1');}catch{try{fs.truncateSync(DEBUG_LOG,0);}catch{}}}
    fs.appendFileSync(DEBUG_LOG,line);
  }catch{}
}
class Collector extends EventEmitter {
  constructor(normalize,parsePacket){super();this.normalize=normalize;this.parsePacket=parsePacket;this.status='disconnected';this.rooms=new Map();this.generation=0;this.lastMessage=null;}
  snapshot(){return{status:this.status,rooms:[...this.rooms.values()],lastMessage:this.lastMessage,error:this.error||null};}
  update(){this.emit('state',this.snapshot());}

  connectBilibili(room,python){return this.connectPlatform('bilibili',room,python);}
  connectPlatform(platform,room,python){
    if(!['bilibili','douyin'].includes(platform))throw Error('Unsupported platform');
    if(!/^\d+$/.test(room))throw Error('请输入直播间数字房间号');
    this.disconnect();this.stopped=false;this.status='connecting';this.error=null;this.rooms=new Map([[room,{id:room,webRoom:'',title:platform==='bilibili'?'B站直播间':'抖音直播间'}]]);this.update();
    const generation=this.generation;
    const child=this.child=require('node:child_process').spawn(python,[path.join(__dirname,'../scripts/bilibili-collector.py'),room,platform],{windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    let buffer='';
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      if(generation!==this.generation)return;buffer+=chunk;if(buffer.length>262144){buffer='';return;}
      let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const packet=JSON.parse(line);if(packet.status){this.status=packet.status;this.error=packet.error||null;}if(packet.event){const event=require('./bilibili-event.cjs').normalizeBilibili(packet.event,room);if(event){this.lastMessage=new Date().toISOString();this.emit('event',event);}}this.update();}catch{}}
    });
    let stderr='';child.stderr.on('data',d=>{stderr=(stderr+d.toString('utf8')).slice(-1200);});
    child.on('error',e=>{if(generation!==this.generation)return;this.status='disconnected';this.error='采集器启动失败：'+e.message;this.update();});
    child.on('exit',()=>{if(generation!==this.generation||this.stopped)return;this.status='disconnected';this.error=this.error||'统一采集进程已退出，请检查 Python 路径后重新连接';this.update();});
  }
  disconnect(){if(this.child?.pid){const child=this.child;require('node:child_process').spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());}this.child=null;this.stopped=true;this.generation++;this.status='disconnected';this.update();dbg('disconnect');}
}
module.exports={Collector,dbg};
