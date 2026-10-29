const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {defaults}=require('../electron/settings.cjs');

test('music page renders default-song controls with saved and older settings',async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});
 const oldWindow=global.window;
 global.window={studio:{}};
 try{
  const {MusicPanel}=await server.ssrLoadModule('/renderer/Music.jsx');
  for(const config of [{...defaults,musicDefaultId:'5276808',musicDefaultLoop:true},{musicVolume:0.5,musicEnabled:true}]){
   const html=renderToStaticMarkup(React.createElement(MusicPanel,{state:{config,music:{donorCount:0,current:null,queue:[],notices:[],position:0}}}));
   assert.ok(html.includes('默认播放歌曲'));
   assert.ok(html.includes('保存默认歌曲设置'));
   assert.ok(html.includes('管理端搜索与试播'));
   if(config.musicDefaultId)assert.ok(html.includes('value="5276808"'));
  }
 }finally{global.window=oldWindow;await server.close();}
});
