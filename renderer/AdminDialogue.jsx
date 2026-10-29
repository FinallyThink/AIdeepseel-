import React,{useState,useRef} from 'react';
export default function AdminDialogue({running,busy,onInsert}){
  const [text,setText]=useState('');const pending=useRef(false);
  const send=async()=>{if(pending.current||busy||!text.trim())return;pending.current=true;try{if(await onInsert(text))setText('');}finally{pending.current=false;}};
  return <section className="panel settings-card admin-dialogue">
    <div className="panel-head"><div>插入对话 <small>ADMIN CHAT</small></div><span className="count-tag">管理员</span></div>
    <label className="field"><span>和 AI 聊一聊</span><textarea rows="3" maxLength="2000" value={text} placeholder="输入想对它说的话，例如：今天我们直播什么内容？" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/></label>
    <div className="admin-dialogue-foot"><span>{text.length}/2000 · Ctrl+Enter 发送{running?'':' · 开始互动后处理'}</span><button className="button primary" disabled={busy||!text.trim()} onClick={send}>插入对话</button></div>
    <p>直接进入回复队列，无需等待弹幕选评。AI 回复会播放语音并显示在聊天记录中；离线演练使用固定示例回复。</p>
  </section>;
}
