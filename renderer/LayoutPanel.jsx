import React,{useState} from 'react';
import {Stage} from './Display.jsx';
import defaults from './default-layout.json';
export default function LayoutPanel({state,busy,onSave,onBackground}){
  const [layout,setLayout]=useState(()=>({...defaults,...JSON.parse(state.config.displayLayout||'{}')}));
  const [selected,setSelected]=useState('model');
  const names={model:'模型框',chat:'聊天记录框',music:'点播音乐框',likes:'点赞最多的人',rice:'赚到白饭数'};
  const patch=(id,value)=>setLayout(l=>({...l,[id]:{...l[id],...value}}));
  const item=layout[selected];
  return <div className="layout-editor"><section className="panel settings-card">
    <h2>展示组件</h2><p>勾选需要展示的组件，在画布中拖动调整位置。</p>
    {Object.entries(names).map(([id,name])=><div className="layout-choice" key={id}><label><input type="checkbox" checked={layout[id].visible} onChange={e=>patch(id,{visible:e.target.checked})}/>{name}</label><button className={`button small ${selected===id?'primary':'subtle'}`} onClick={()=>setSelected(id)}>调整</button></div>)}
    <h3>{names[selected]}</h3><div className="field-grid">{[['x','横向位置'],['y','纵向位置'],['width','宽度'],['height','高度']].map(([key,label])=><label className="field" key={key}><span>{label}（%）</span><input type="number" min={key==='width'||key==='height'?5:0} max="100" step="1" value={item[key]} onChange={e=>{const value=Math.min(100,Math.max(key==='width'||key==='height'?5:0,Number(e.target.value)));const next={...item,[key]:value};next.x=Math.min(next.x,100-next.width);next.y=Math.min(next.y,100-next.height);patch(selected,next);}}/></label>)}</div>
    <div className="inline-actions"><button className="button small" onClick={()=>onBackground('background')}>选择背景</button><button className="text-button" onClick={()=>onBackground('clearBackground')}>恢复主题</button></div>
    <div className="model-poses"><button className="button primary" disabled={busy} onClick={()=>onSave({displayLayout:JSON.stringify(layout)})}>保存展示布局</button><button className="button subtle" onClick={()=>setLayout(structuredClone(defaults))}>重置布局</button></div>
  </section><section className="panel layout-canvas"><Stage state={state} preview layout={layout} editing selected={selected} onSelect={setSelected} onLayout={patch}/><p>边框和组件名称仅在编辑时显示，保存后同步到展示窗口。</p></section></div>;
}
