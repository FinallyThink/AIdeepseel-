const {spawn}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let server,child;
(async()=>{
  const {createServer}=await import('vite');
  server=await createServer({root,server:{host:'127.0.0.1',port:5173,strictPort:true}});
  await server.listen();
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  child=spawn(require('electron'),[root,'--dev'],{cwd:root,env,stdio:'inherit',windowsHide:true});
  child.on('error',async e=>{console.error(e.message);await server.close();process.exitCode=1;});
  child.on('exit',async code=>{await server.close();process.exitCode=code||0;});
})().catch(async e=>{console.error(e.message);await server?.close();process.exitCode=1;});
process.on('SIGINT',()=>child?.kill());
process.on('SIGTERM',()=>child?.kill());
