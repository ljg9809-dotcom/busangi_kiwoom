 'use strict';
const {data}=require('./busangi-game.js');
const JOB_POINTS=Object.freeze({'중소기업':1000,'중견기업':2000,'공무원':3000,'공기업':4000,'대기업':5000});
function score(state,quotes={}){
 const job=data.jobs.find(j=>j.id===state.job);
 const propertyValue=data.assets.reduce((sum,a)=>sum+Math.round(a.price*(state.assetShares[a.id]||0)/100),0);
 const stockValue=Object.entries(state.stocks).reduce((sum,[code,h])=>{
  if(!h.quantity)return sum;const quote=quotes[code];
  if(!quote||!Number.isSafeInteger(quote.price)||quote.price<=0)throw Error('보유 주식의 시세를 확인해줘.');
  return sum+quote.price*h.quantity;
 },0);
 const totalAssets=state.cash+propertyValue+stockValue;
 if(!Number.isSafeInteger(totalAssets)||totalAssets<0)throw Error('자산 범위를 확인해줘.');
 const jobPoints=JOB_POINTS[job?.type]||0,assetPoints=Math.floor(totalAssets/10000);
 return {jobName:job?.name||'취업준비생',jobType:job?.type||'미취업',jobPoints,totalAssets,assetPoints,totalScore:jobPoints+assetPoints};
}
function leaderboard(rows,userId,page=1,quotes={}){
 const ranked=[];
 for(const row of rows){try{ranked.push({id:row.id,nickname:row.nickname,...score(JSON.parse(row.state),quotes)});}catch{/* Ignore corrupt legacy saves. */}}
 ranked.sort((a,b)=>b.totalScore-a.totalScore||a.nickname.localeCompare(b.nickname,'ko')||a.id.localeCompare(b.id));
 let rank=0;const entries=ranked.map((entry,i)=>{if(!i||entry.totalScore!==ranked[i-1].totalScore)rank=i+1;const {id,...visible}=entry;return {...visible,rank,isMe:id===userId};});
 const pages=Math.max(1,Math.ceil(entries.length/20)),current=Math.min(pages,Math.max(1,page));
 return {entries:entries.slice((current-1)*20,current*20),me:entries.find(e=>e.isMe)||null,total:entries.length,page:current,pages,updatedAt:new Date().toISOString()};
}
async function getRankingQuotes(rows,market,cache,now=Date.now()){
 const codes=new Set();for(const row of rows){try{for(const [code,h]of Object.entries(JSON.parse(row.state).stocks))if(h.quantity>0)codes.add(code);}catch{}}
 const quotes={};let stale=false;
 await Promise.all([...codes].map(async code=>{
  let q=cache.get(code);
  if(!q||now-q.timestamp>60000){
   try{const fresh=await market.getQuote(code);if(fresh.code!==code||!Number.isSafeInteger(fresh.price)||fresh.price<=0||!Number.isFinite(fresh.timestamp)||fresh.timestamp>now+60000)throw Error('시세 오류');q=fresh;cache.set(code,q);}
   catch{if(!q)throw Error('보유 주식 시세를 불러오지 못했어. 잠시 후 랭킹을 새로고침해줘.');stale=true;}
  }
  quotes[code]=q;
 }));
 return {quotes,stale,valuationAt:codes.size?Math.min(...Object.values(quotes).map(q=>q.timestamp)):null};
}
module.exports={score,leaderboard,JOB_POINTS,getRankingQuotes};
