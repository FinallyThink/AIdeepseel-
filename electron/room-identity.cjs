// A session RoomId changes on each broadcast; WebRoomId identifies the channel.
function stableRoom(roomId, records=[]){
  if(!roomId||roomId==='demo')return roomId;
  const matches=new Set(records.map(r=>r.event||r).filter(e=>e.room===roomId&&e.webRoom&&e.webRoom!=='demo').map(e=>e.webRoom));
  return matches.size===1?[...matches][0]:roomId;
}
module.exports={stableRoom};
