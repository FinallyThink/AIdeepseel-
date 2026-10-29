import React,{useEffect,useRef,useState}from'react';
import './vitals.css';
function Bowl(){return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 13h20c-1 7-4 10-10 10S5 20 4 13Z" fill="currentColor" opacity=".22"/><path d="M4 13h20c-1 7-4 10-10 10S5 20 4 13ZM10 24h8M10 9c-3-3 3-4 0-7M16 9c-3-3 3-4 0-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function Heart(){return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M14 24 4.5 14.5C-2 7 8 0 14 7c6-7 16 0 9.5 7.5L14 24Z" fill="currentColor" opacity=".22"/><path d="m14 24-9.5-9.5C-2 7 8 0 14 7c6-7 16 0 9.5 7.5L14 24Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>}
const METRICS=[['food','剩余饭量',Bowl,'碗','每次回复消耗 1 碗'],['happiness','开心值',Heart,'点','心意正在温暖小鲸']];
export default function Vitals({state}){
  const panel=useRef(null);
  useEffect(()=>{
    const element=panel.current,stage=element?.closest('.stage');if(!stage)return;
    const reserve=()=>stage.style.setProperty('--vitals-height',`${element.getBoundingClientRect().height}px`);
    const observer=new ResizeObserver(reserve);observer.observe(element);reserve();
    return()=>{observer.disconnect();stage.style.removeProperty('--vitals-height');};
  },[]);
  const mode=state.config.simulation?'demo':'live';const values=state.pipeline.vitals||{food:20,happiness:50};
  const events=state.pipeline.vitalEvents||[];const seen=useRef(new Set(events.map(e=>e.id))),lastMode=useRef(mode);const[effects,setEffects]=useState([]);
  useEffect(()=>{
    if(lastMode.current!==mode){lastMode.current=mode;seen.current=new Set(events.map(e=>e.id));setEffects([]);return;}
    const incoming=events.filter(e=>!seen.current.has(e.id));for(const e of incoming)seen.current.add(e.id);
    if(seen.current.size>200)seen.current=new Set(events.map(e=>e.id));
    if(incoming.length)setEffects(previous=>[...previous,...incoming.map(e=>({...e,receivedAt:Date.now()}))].slice(-20));
  },[events,mode]);
  useEffect(()=>{const timer=setInterval(()=>setEffects(previous=>previous.filter(e=>Date.now()-e.receivedAt<1600)),200);return()=>clearInterval(timer);},[]);
  const titleOf=(metric,zero,hint)=>zero?(metric==='food'?'饭团能量见底啦':hint):metric==='happiness'&&values.happiness>=100?'开心到冒泡泡':hint;
  return <aside ref={panel} className="vitals-panel" aria-label="澜鲸的饭量与开心值"><div className="vitals-heading"><span>小鲸的补给站</span><small>{mode==='demo'?'DEMO STATUS':'WHALE STATUS'}</small></div><div className="vitals-grid">{METRICS.map(([metric,label,Icon,unit,hint])=>{
    const list=effects.filter(e=>e.metric===metric);const latest=list.at(-1);const zero=values[metric]===0;
    return <div className={`vital-card vital-${metric} ${zero?'vital-empty':''}`} key={metric} title={titleOf(metric,zero,hint)}><div className="vital-label"><Icon/><span>{label}</span></div><div className="vital-value-wrap"><strong data-vital={metric} key={latest?.id||metric} className={latest?`vital-number change-${latest.delta>0?'up':'down'}`:'vital-number'}>{values[metric].toLocaleString('zh-CN')}</strong><small>{unit}</small>{list.map((e,i)=><span key={e.id} data-delta={e.delta} className={`vital-float float-${e.delta>0?'up':'down'}`} style={{'--drift':`${(i%3-1)*12}px`}}>{e.delta>0?'+':''}{e.delta.toLocaleString('zh-CN')}</span>)}</div></div>;
  })}</div></aside>;
}
