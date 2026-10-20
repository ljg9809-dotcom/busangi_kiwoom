const test=require('node:test'),assert=require('node:assert/strict');
const {score,leaderboard}=require('./ranking.cjs'),api=require('./busangi-game.js');
const {AccountStore}=require('./account-store.cjs');
const state=()=>api.create({storage:null}).state;
test('직장 점수는 요청한 순서·현재 직장만, 자산은 현금과 지분 및 주식 평가금액',()=>{
 const s=state();s.cash=19999;
 for(const [id,points] of [['dongbaek',1000],['haeon',2000],['city',3000],['metro',4000],['samsong',5000]]){s.job=id;assert.equal(score(s).jobPoints,points);}
 s.job=null;s.assetShares={[api.data.assets[0].id]:1};s.stocks={'005930':{quantity:2,cost:20001.5}};s.income.pending=999999;
 const quotes={'005930':{price:30000}};const expected=19999+Math.round(api.data.assets[0].price/100)+60000;
 assert.equal(score(s,quotes).totalAssets,expected);assert.equal(score(s,quotes).totalScore,Math.floor(expected/10000));
 s.job='dongbaek';assert.equal(score(s,quotes).jobPoints,1000);assert.throws(()=>score(s));
});
test('공동 순위·20명 페이지·페이지 밖 내 순위·비공개 필드 제외',()=>{
 const rows=Array.from({length:23},(_,i)=>({id:String(i),nickname:'유저'+i,state:JSON.stringify({...state(),cash:i<2?999999:10000*(23-i)})}));
 const result=leaderboard(rows,'22',1);assert.equal(result.entries.length,20);assert.equal(result.total,23);
 assert.equal(result.entries[0].rank,1);assert.equal(result.entries[1].rank,1);assert.equal(result.entries[2].rank,3);
 assert.equal(result.me.rank,23);assert.equal(leaderboard(rows,'22',2).entries.length,3);
 assert.equal(leaderboard(rows,null,999).page,2);assert.equal(result.entries[0].id,undefined);assert.equal(result.entries[0].state,undefined);
 assert.equal(leaderboard([],null).total,0);
});
test('실제 회원 저장 갱신·가입만 한 회원 제외·클라이언트 점수 무시',async()=>{
 const store=new AccountStore();try{
 const a=await store.register('<img onerror=x>★','test-ranking-only'),b=await store.register('저장없음','test-ranking-only');
 const s=state();s.totalScore=999999;s.jobPoints=999999;store.save(a,s,0);
 assert.equal(store.ranking(a).total,1);assert.equal(store.ranking(a).me.totalScore,3);assert.equal(store.ranking(b).me,null);
 s.job='samsong';store.save(a,s,1);assert.equal(store.ranking(a).me.totalScore,5003);
 const json=JSON.stringify(store.ranking(a));for(const key of ['password_hash','salt','token','revision'])assert.equal(json.includes(key),false);
 }finally{store.close();}
});
test('랭킹 HTTP 공개 조회·내 계정 표시·입력 검증',async()=>{
 const {createServer}=require('./market-server.cjs'),http=require('node:http');const accounts=new AccountStore();
 const u=await accounts.register('랭킹 HTTP','test-ranking-only');accounts.save(u,state(),0);const token=accounts.session(u);
 const server=createServer({getQuote:async()=>({})},{accounts});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const call=(path,cookie='')=>new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port:server.address().port,path,headers:{Host:'127.0.0.1:4173',Cookie:cookie}},res=>{let data='';res.on('data',d=>data+=d);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(data)}));}).on('error',reject);});
 try{const guest=await call('/api/ranking');assert.equal(guest.status,200);assert.equal(guest.data.me,null);assert.equal(guest.data.total,1);
 const mine=await call('/api/ranking','busangi_session='+token);assert.equal(mine.data.me.nickname,u.nickname);
 assert.equal((await call('/api/ranking?page=-1')).status,400);
 }finally{await new Promise(r=>server.close(r));}
});

test('전체 회원 종목별 시세 재사용·평가액으로 순위 변경·시세 실패 시 이전 조회값 명시',async()=>{
 const {getRankingQuotes}=require('./ranking.cjs');const cache=new Map();let calls=0;
 const s=state();s.cash=0;s.stocks={'005930':{quantity:2,cost:1}};
 const rows=[{id:'a',nickname:'주식 보유',state:JSON.stringify(s)},{id:'b',nickname:'현금 보유',state:JSON.stringify({...state(),cash:100000})}];
 const market={getQuote:async code=>{calls++;return {code,price:75000,timestamp:1000};}};
 const v=await getRankingQuotes(rows,market,cache,1000);assert.equal(calls,1);assert.equal(leaderboard(rows,'a',1,v.quotes).me.rank,1);assert.equal(leaderboard(rows,'a',1,v.quotes).me.totalAssets,150000);
 await getRankingQuotes(rows,market,cache,1001);assert.equal(calls,1);
 const fail={getQuote:async()=>{throw Error('offline');}};
 assert.equal((await getRankingQuotes(rows,fail,cache,100000)).stale,true);
 await assert.rejects(getRankingQuotes(rows,fail,new Map(),100000));
});
