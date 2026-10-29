import React,{useState} from 'react';

export default function ClearRecords({pipeline:p,busy,onClear}){
  const [confirm,setConfirm]=useState(false);
  const blocked=p.running||p.current||p.preparing||p.selecting;
  const empty=!p.jobs.length&&!p.feed.length&&!p.candidates.length&&!p.history.length;
  return <section className="panel" style={{padding:18,marginBottom:20}}>
    <div className="panel-head" style={{padding:0}}><div>消息与回复记录</div><button className="button subtle" disabled={busy||blocked||empty} onClick={()=>setConfirm(true)}>清空消息与回复</button></div>
    <p style={{color:'#829ab6',lineHeight:1.8,marginTop:10}}>清空实时消息、候选弹幕、全部待回复（含礼物）、已播报记录及本次计数。长期记忆保留。连接期间的新消息仍会继续接收。</p>
    {blocked&&<p className="gold">请先暂停互动，并等待当前生成、合成或播报结束。</p>}
    {confirm&&<div className="inline-actions" role="group" aria-label="确认清空记录"><span className="gold">确认清空？未播报的礼物也会删除，无法撤销。</span><button className="button warning small" disabled={busy||blocked||empty} onClick={async()=>{if(await onClear())setConfirm(false);}}>确认清空</button><button className="text-button" disabled={busy} onClick={()=>setConfirm(false)}>取消</button></div>}
  </section>;
}
