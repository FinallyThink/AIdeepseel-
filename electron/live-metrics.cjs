class LiveMetrics{
  constructor(){this.room='';this.likes=new Map();this.leader=null;this.fen=0;this.unknown=0;}
  reset(room){this.room=room;this.likes.clear();this.leader=null;this.fen=0;this.unknown=0;}
  ingest(e){
    if(this.room!==e.room)this.reset(e.room);
    if(e.kind==='gift'){
      if(Number.isSafeInteger(e.giftFen)&&e.giftFen>=0)this.fen+=e.giftFen;else this.unknown++;
    }
    if(e.kind!=='like')return null;
    const key=e.userId||e.user;
    const previous=this.likes.get(key)||{key,user:e.user,count:0};
    const next={...previous,user:e.user,count:previous.count+e.count};this.likes.set(key,next);
    if(!this.leader||next.count>this.leader.count||key===this.leader.key){const changed=this.leader?.key!==key;this.leader=next;return changed?next:null;}
    return null;
  }
  snapshot(){return {room:this.room,leader:this.leader,rice:this.fen/100,unknownValueGifts:this.unknown};}
}
module.exports={LiveMetrics};
