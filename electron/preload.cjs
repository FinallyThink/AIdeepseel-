const {contextBridge,ipcRenderer}=require('electron');
const listen=(channel,callback)=>{const f=(_,data)=>callback(data);ipcRenderer.on(channel,f);return()=>ipcRenderer.removeListener(channel,f);};
contextBridge.exposeInMainWorld('studio',{
  state:()=>ipcRenderer.invoke('studio:state'),
  command:(name,value)=>ipcRenderer.invoke('studio:command',name,value),
  onState:callback=>listen('studio:state',callback),
  onPlay:callback=>listen('studio:play',callback),
  onMusicPlay:callback=>listen('studio:musicPlay',callback),
  onMusicControl:callback=>listen('studio:musicControl',callback),
  musicAudio:data=>ipcRenderer.send('studio:musicAudio',data),
  audio:(id,status,error)=>ipcRenderer.send('studio:audio',{id,status,error}),
  ready:()=>ipcRenderer.send('studio:ready')
});
