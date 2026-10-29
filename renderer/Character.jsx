import React,{useEffect,useState} from 'react';
import actions from './dsh-actions.json';

function PetVideo({pose,action}){
  const [randomAction,setRandomAction]=useState(()=>actions[Math.floor(Math.random()*actions.length)].id);
  const random=action==='random';
  const next=()=>setRandomAction(previous=>{
    const candidates=actions.filter(a=>a.id!==previous);
    return candidates[Math.floor(Math.random()*candidates.length)].id;
  });
  const selected=random?randomAction:action||pose;
  return <video key={selected} src={`./dsh-pet/${selected}.webm`} autoPlay loop={!random} muted playsInline onEnded={random?next:undefined} aria-label="dsh-pet" style={{width:'100%',height:'100%',objectFit:'contain'}}/>;
}

// Reuse the illustrated 澜鲸 blink sequence from the desktop assistant.
const frames=['open','half','closed','closed','half','open'];
const frameUrl=name=>`./character/blink/${name}.png`;
export default function Character({pose,model='lanjing',action=''}){
  const [frame,setFrame]=useState(null);
  useEffect(()=>{
    let cancelled=false,timer;setFrame(null);
    if(pose!=='idle'||model==='dsh-pet')return;
    const images=[...new Set(frames)].map(name=>{
      const image=new Image();
      const ready=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
      image.src=frameUrl(name);return ready;
    });
    const blink=()=>{
      let index=0;
      const advance=()=>{
        if(cancelled)return;
        if(index<frames.length){setFrame(frames[index++]);timer=setTimeout(advance,1000/12);}
        else {setFrame(null);timer=setTimeout(blink,2800+Math.random()*3200);}
      };
      advance();
    };
    Promise.all(images).then(()=>{if(!cancelled)timer=setTimeout(blink,2500);}).catch(()=>{});
    return()=>{cancelled=true;clearTimeout(timer);};
  },[pose,model]);
  if(model==='dsh-pet')return <PetVideo key={`${pose}:${action}`} pose={pose} action={action}/>;
  return <img src={pose==='idle'&&frame?frameUrl(frame):`./character/${pose}.png`} data-blink={pose==='idle'&&frame?frame:'none'} alt="澜鲸"/>;
}
