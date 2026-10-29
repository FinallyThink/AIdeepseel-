import React,{useEffect,useRef,useState} from 'react';
import Character from './Character.jsx';
import {MusicPlayback,MusicWidget} from './Music.jsx';
import Stage from './Stage.jsx';
export {Stage};
const api=window.studio;
const time=at=>new Date(at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
export default function Display({state}){
  const audio=useRef(null),[localError,setLocalError]=useState(''),volume=useRef(state.config.volume);
  volume.current=state.config.volume;
  useEffect(()=>{
    const off=api.onPlay(job=>{
      audio.current?.pause();setLocalError('');const player=new Audio(job.audio);audio.current=player;player.volume=volume.current;
      let started=false,ended=false;const fail=message=>{if(ended)return;ended=true;setLocalError(message);api.audio(job.id,'error',message);};
      player.onplaying=()=>{if(!started){started=true;api.audio(job.id,'playing');}};
      player.onended=()=>{if(ended)return;ended=true;api.audio(job.id,'ended');};
      player.onerror=()=>fail('音频无法播放，请在管理端重试');
      player.play().catch(()=>fail('音频播放受阻，请在管理端重试'));
    });api.ready();return()=>{off();audio.current?.pause();};
  },[]);
  useEffect(()=>{if(audio.current)audio.current.volume=state.config.volume;},[state.config.volume]);
  return <><MusicPlayback state={state}/><Stage state={state} error={localError}/></>;
}
