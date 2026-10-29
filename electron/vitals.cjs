const {randomUUID}=require('node:crypto');
const MAX=Number.MAX_SAFE_INTEGER;
const value=(n,fallback)=>Number.isSafeInteger(n)&&n>=0?n:fallback;
function initial(config){return{food:value(config.initialFood,20),happiness:value(config.initialHappiness,50)};}
function restore(saved,config){const base=initial(config);return{food:value(saved?.food,base.food),happiness:value(saved?.happiness,base.happiness)};}
function giftPoints(event){
  const count=value(event.count,1);if(!count)return 0;
  const price=event.gift==='小心心'?1:(Number.isSafeInteger(event.giftValue)&&event.giftValue>0?event.giftValue:1);
  return Math.min(MAX,price*count);
}
function change(state,metric,amount,reason,at){
  const before=state[metric];const next=Math.min(MAX,Math.max(0,before+amount));state[metric]=next;
  return next===before?null:{id:randomUUID(),metric,delta:next-before,value:next,reason,at};
}
module.exports={initial,restore,giftPoints,change};
