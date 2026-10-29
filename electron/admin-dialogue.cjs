const {randomUUID}=require('node:crypto');
function insertDialogue(pipeline,text){
  if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('请输入 1–2000 字的对话内容');
  if(pipeline.closed)throw Error('程序正在关闭');
  if(pipeline.jobs.filter(j=>j.event.kind==='api').length>=100)throw Error('管理员与本机接口对话队列已满');
  const room=pipeline.config().roomId;
  if(!room)throw Error('请先设置直播间，或在工作台加入离线演练消息');
  pipeline.enqueue({id:randomUUID(),kind:'api',mode:'reply',room,user:'管理员',userId:'studio-admin',content:text.trim(),at:pipeline.now()});
  const job=pipeline.jobs.at(-1);pipeline.changed();return {id:job.id};
}
module.exports={insertDialogue};
