function songId(value){
  const text=String(value||'').trim();if(/^\d{1,16}$/.test(text))return text;
  try{const u=new URL(text);if(!['music.163.com','y.music.163.com'].includes(u.hostname))return null;const id=u.searchParams.get('id')||new URLSearchParams((u.hash.split('?')[1]||'')).get('id');return /^\d{1,16}$/.test(id||'')?id:null;}catch{return null;}
}
function allowedAudio(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!(u.hostname==='music.126.net'||u.hostname.endsWith('.music.126.net')))throw Error('网易云未返回受支持的官方音频地址');u.protocol='https:';return u.toString();}
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
function track(s){return{id:String(s.id),title:String(s.name||'未命名歌曲').slice(0,200),artist:(s.artists||s.ar||[]).map(a=>a.name).join(' / ').slice(0,200),duration:Number(s.duration||s.dt)||0};}
class Netease {
  constructor({fetchImpl=fetch}={}){this.fetch=fetchImpl;}
  async json(path){const r=await this.fetch('https://music.163.com'+path,{headers:{Referer:'https://music.163.com/'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('网易云请求失败 HTTP '+r.status);const body=await r.json();if(body.code!==200)throw Error('网易云暂时无法提供服务（'+body.code+'）');return body;}
  async search(query){if(typeof query!=='string'||!query.trim()||query.length>120)throw Error('歌名请填写 1～120 字');const id=songId(query);if(id)return[this.detail?await this.detail(id):null].filter(Boolean);const body=await this.json('/api/search/get?'+new URLSearchParams({s:query,type:'1',offset:'0',limit:'12'}));return(body.result?.songs||[]).map(track);}
  async detail(id){if(!/^\d{1,16}$/.test(String(id)))throw Error('歌曲 ID 无效');const b=await this.json('/api/song/detail?ids='+encodeURIComponent(JSON.stringify([String(id)])));if(!b.songs?.[0])throw Error('找不到该网易云歌曲');return track(b.songs[0]);}
  async find(query){
    const id=songId(query);if(id)return this.detail(id);
    const [name,artist]=query.split(/\s*[|/]\s*/,2);const results=await this.search([name,artist].filter(Boolean).join(' '));
    const exact=results.filter(s=>normalize(s.title)===normalize(name)&&(!artist||normalize(s.artist).includes(normalize(artist))));
    if(!exact.length)throw Error('未找到准确匹配，请使用“点歌 歌名 / 歌手”或网易云歌曲链接、ID');return exact[0];
  }
  async resolve(id){const b=await this.json('/api/song/enhance/player/url?ids='+encodeURIComponent(JSON.stringify([String(id)]))+'&br=128000');const d=b.data?.find(s=>String(s.id)===String(id));if(!d?.url||d.code!==200||d.freeTrialInfo)throw Error('此歌暂无完整可播地址，可能需要会员或暂不可用，请换一首');return allowedAudio(d.url);}
  async stream(url,range){
    let target=allowedAudio(url);
    for(let i=0;i<4;i++){
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);let response;
      try{response=await this.fetch(target,{headers:{Referer:'https://music.163.com/',...(range&&/^bytes=\d*-\d*$/.test(range)?{Range:range}:{})},redirect:'manual',signal:controller.signal});}finally{clearTimeout(timer);}
      if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('网易云音频跳转异常');target=allowedAudio(new URL(location,target).toString());continue;}
      const type=response.headers.get('content-type')||'';
      if(![200,206].includes(response.status)||!(/audio\//i.test(type)||/application\/octet-stream/i.test(type))){await response.body?.cancel();throw Error('网易云音频当前无法播放，请重新点歌');}
      const headers={};for(const name of ['content-type','content-length','content-range','accept-ranges'])if(response.headers.has(name))headers[name]=response.headers.get(name);
      return new Response(response.body,{status:response.status,headers});
    }throw Error('网易云音频跳转过多');
  }
}
module.exports={Netease,songId,allowedAudio};
