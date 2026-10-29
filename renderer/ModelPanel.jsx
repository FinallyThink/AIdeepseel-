import React,{useState} from 'react';
import Character from './Character.jsx';
import actions from './dsh-actions.json';

const models=[
  {id:'lanjing',name:'澜鲸立绘',description:'静态立绘与自然眨眼'},
  {id:'dsh-pet',name:'dsh-pet',description:'透明视频动画 · 待机、思考、播报'},
];
export default function ModelPanel({config,busy,onSave}){
  const [model,setModel]=useState(config.characterModel||'lanjing');
  const [scale,setScale]=useState(config.characterScale);
  const [pose,setPose]=useState('idle');
  const [action,setAction]=useState('');
  const [query,setQuery]=useState('');
  const [mapping,setMapping]=useState({petIdleAction:config.petIdleAction||'',petThinkAction:config.petThinkAction||'',petSpeakAction:config.petSpeakAction||''});
  const visible=actions.filter(a=>a.name.includes(query.trim()));
  const current=models.find(m=>m.id===config.characterModel)||models[0];
  return <div className="model-layout">
    <section className="panel settings-card">
      <div className="settings-title"><span>01</span><div><h2>角色模型</h2><p>当前使用：{current.name}</p></div></div>
      <div className="model-options">{models.map(m=><label key={m.id} className={`model-option ${model===m.id?'selected':''}`}>
        <input type="radio" name="character-model" value={m.id} checked={model===m.id} onChange={()=>setModel(m.id)}/>
        <div><b>{m.name}</b><p>{m.description}</p></div>
      </label>)}</div>
      <label className="field"><span>人物大小 · {scale}%</span><input type="range" min="60" max="150" value={scale} onChange={e=>setScale(Number(e.target.value))}/></label>
      <div className="info-note">右侧可预览不同动作，保存后同步更新工作台和展示窗口。</div>
      {model==='dsh-pet'&&<><h3>直播自动动作</h3><p>待机、思考可选择随机：每段播放结束后随机切换，避免连续重复；进入其他状态立即切换。</p><div className="field-grid">{[['petIdleAction','待机'],['petThinkAction','思考'],['petSpeakAction','播报']].map(([key,label])=><label className="field" key={key}><span>{label}动作</span><select value={mapping[key]} onChange={e=>setMapping(m=>({...m,[key]:e.target.value}))}><option value="">默认动作</option>{key!=='petSpeakAction'&&<option value="random">随机动作（全部动作）</option>}{actions.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>)}</div></>}
      <button className="button primary" disabled={busy} onClick={()=>onSave({characterModel:model,characterScale:scale,...mapping})}>保存模型设置</button>
    </section>
    <section className="panel model-preview-panel">
      <div className="panel-head"><div>模型预览 <small>MODEL PREVIEW</small></div></div>
      <div className="model-preview"><div style={{transform:`scale(${scale/100})`}}><Character model={model} pose={pose} action={action}/></div></div>
      <div className="model-poses">{[['idle','待机'],['think','思考'],['happy','播报']].map(([id,label])=><button key={id} className={`button ${pose===id&&!action?'primary':'subtle'}`} onClick={()=>{setPose(id);setAction('');}}>{label}</button>)}</div>
      {model==='dsh-pet'&&<div className="action-library"><label className="field"><span>全部动作 · {actions.length} 个</span><input placeholder="搜索动作名称" value={query} onChange={e=>setQuery(e.target.value)}/></label><p role="status">正在预览：{actions.find(a=>a.id===action)?.name||{idle:'默认待机',think:'默认思考',happy:'默认播报'}[pose]}</p><div className="action-list">{visible.map(a=><button key={a.id} className={`button ${action===a.id?'primary':'subtle'}`} onClick={()=>setAction(a.id)}>{a.name}</button>)}{!visible.length&&<p>没有匹配的动作</p>}</div></div>}
    </section>
  </div>;
}
