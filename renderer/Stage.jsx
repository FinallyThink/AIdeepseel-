import React, { useRef, useEffect } from 'react';
import Character from './Character.jsx';
import { MusicWidget } from './Music.jsx';
import defaults from './default-layout.json';
import './layout.css';

export default function Stage({ state, preview = false, layout, editing = false, selected, onSelect, onLayout }) {
  const { config, pipeline: p } = state, playing = p.current?.state === 'playing';
  const boxes = layout || ({ ...defaults, ...JSON.parse(config.displayLayout || '{}') });
  const root = useRef(null), list = useRef(null), drag = useRef(null);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [p.history.length, p.current?.id]);
  const start = (e, id) => { if (!editing || e.button !== 0) return; e.preventDefault(); onSelect(id); const rect = root.current.getBoundingClientRect(); drag.current = { id, x: e.clientX, y: e.clientY, box: { ...boxes[id] }, rect }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = e => { const d = drag.current; if (!d) return; onLayout(d.id, { x: Math.max(0, Math.min(100 - d.box.width, d.box.x + (e.clientX - d.x) * 100 / d.rect.width)), y: Math.max(0, Math.min(100 - d.box.height, d.box.y + (e.clientY - d.y) * 100 / d.rect.height)) }); };
  const contents = {
    model: <div className="layout-character" style={{ transform: `scale(${config.characterScale / 100})` }}><Character model={config.characterModel} pose={playing ? 'happy' : p.preparing ? 'think' : 'idle'} action={playing ? config.petSpeakAction : p.preparing ? config.petThinkAction : config.petIdleAction} /></div>,
    chat: <div className="wechat-chat"><header className="wechat-title">聊天记录</header><div className="wechat-messages" ref={list}>{p.history.slice(-config.historyCount).map(m => <article key={m.id}><div className="wechat-row viewer"><div className="wechat-avatar">{m.event.user?.slice(0, 1) || '观'}</div><div className="wechat-body"><div className="wechat-name">{m.event.user}</div><p className="wechat-bubble">{m.event.kind === 'gift' ? `${m.event.gift} × ${m.event.count}` : m.event.content}</p></div></div><div className="wechat-row host"><div className="wechat-avatar">澜</div><div className="wechat-body"><div className="wechat-name">澜鲸</div><p className="wechat-bubble">{m.text}</p></div></div></article>)}</div></div>,
    likes: <div className="metric-card"><span>本次点赞最多的人</span><strong>{state.metrics?.leader?.user || '等待点赞'}</strong>{state.metrics?.leader?.count || 0} 次点赞</div>,
    rice: <div className="metric-card rice-card"><span>赚到白饭数</span><strong>{(state.metrics?.rice || 0).toFixed(2)} <small>碗</small></strong></div>,
    music: <MusicWidget state={state} />
  };
  return <div ref={root} className={`stage clean-stage ${preview ? 'stage-preview' : ''} theme-${config.theme} ${editing ? 'layout-editing' : ''}`} style={config.background ? { backgroundImage: `url("${config.background}")` } : {}}>
    {Object.entries(boxes).filter(([, b]) => b.visible).map(([id, b]) => <div key={id} data-component={id} className={`stage-component component-${id} ${selected === id ? 'component-selected' : ''}`} style={{ left: b.x + '%', top: b.y + '%', width: b.width + '%', height: b.height + '%' }} onPointerDown={e => start(e, id)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {editing && <span className="component-label">{{ model: '模型框', chat: '聊天记录框', music: '点播音乐框', likes: '点赞最多的人', rice: '赚到白饭数' }[id]}</span>}{contents[id]}
    </div>)}
  </div>;
}
