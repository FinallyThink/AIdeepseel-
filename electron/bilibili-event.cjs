// Upstream normalized event schema: {platform,type,data:{name,content,item,num}}.
function normalizeBilibili(packet, room, now=Date.now()) {
  if(!['bilibili','抖音','douyin'].includes(packet?.platform)||!/^\d+$/.test(room))return null;
  const kind={Chat:'chat',Gift:'gift',Subscribe:'gift',SuperChat:'chat',EnterRoom:'enter',Follow:'follow',Like:'like'}[packet.type];
  if(!kind)return null;
  const d=packet.data||{},clean=(s,n=500)=>String(s??'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,n);
  const count=Number(kind==='like'?d.count??1:d.num??1),content=clean(d.content);
  if(kind==='like'&&(!Number.isSafeInteger(count)||count<1))return null;
  if(kind==='gift'&&(!Number.isSafeInteger(count)||count<1))return null;
  if(kind==='chat'&&!content)return null;
  const yuan=d.price_yuan;
  return {kind,room,webRoom:'',id:'',userId:clean(d.uid,100),user:clean(d.name,40)||'观众',content,gift:clean(d.item,50)||'礼物',count,giftFen:typeof yuan==='number'&&Number.isFinite(yuan)&&yuan>=0?Math.round(yuan*100):null,giftValue:null,at:now,platform:packet.platform==='bilibili'?'bilibili':'douyin'};
}
module.exports={normalizeBilibili};
