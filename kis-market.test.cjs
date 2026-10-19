'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {KisMarket}=require('./kis-market.cjs');
const {createServer}=require('./market-server.cjs');
const gameAPI=require('./busangi-game.js');
function fixture(){
  const calls=[],saved=[],time=1000000;
  const vaultImpl=async(mode,payload)=>{if(mode==='credentials')return {appKey:'test-key',appSecret:'test-secret'};if(mode==='token-read')return {};saved.push(JSON.parse(payload));return {};};
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),method:options.method||'GET'});
    const data=String(url).includes('tokenP')?{access_token:'test-token',expires_in:86400}:String(url).includes('search-stock-info')?{rt_cd:'0',output:{prdt_abrv_name:'테스트주식',tr_stop_yn:'N'}}:{rt_cd:'0',output:{rprs_mrkt_kor_name:'코스피',stck_prpr:'10000',temp_stop_yn:'N',prdy_vrss:'-100',prdy_ctrt:'-0.99'}};
    return {ok:true,json:async()=>data};
  };
  return {market:new KisMarket({fetchImpl,vaultImpl,now:()=>time}),calls,saved,time};
}
test('현재가 조회 전용 경로·인증 캐시·현재가 게임 매매',async()=>{
  const f=fixture();await f.market.init();const quote=await f.market.getQuote('005930');
  assert.equal(quote.name,'테스트주식');assert.equal(quote.price,10000);assert.equal(quote.realtime,false);
  assert.equal(quote.executionModel,'game-current-price');assert.equal(quote.change,-100);
  const game=gameAPI.create({storage:null,now:()=>f.time,market:{getQuote:async()=>quote}});
  game.state.cash=30000;await game.trade('buy','005930',1);await game.trade('sell','005930',1);
  assert.equal(game.state.cash,29980);assert.equal(game.state.stocks['005930'],undefined);
  await f.market.getQuote('005930');assert.equal(f.calls.filter(c=>c.url.includes('tokenP')).length,1);
  assert.equal(f.calls.filter(c=>c.url.includes('search-stock-info')).length,1);
  assert.equal(f.saved.length,1);
  await assert.rejects(f.market.request('order',{},''));
  await assert.rejects(f.market.getQuote('../secret'));
  assert.ok(f.calls.every(c=>c.method==='GET'||c.url.endsWith('/oauth2/tokenP')));
});
test('과거 조회 가격·거래정지·표시되지 않은 지연 시세는 게임 주문 거절',async()=>{
  const f=fixture();await f.market.init();const q=await f.market.getQuote('005930');
  const game=gameAPI.create({storage:null,now:()=>f.time,market:{getQuote:async()=>q}});game.state.cash=30000;
  q.timestamp=f.time-60001;await assert.rejects(game.trade('buy','005930',1));
  q.timestamp=f.time;q.tradable=false;await assert.rejects(game.trade('buy','005930',1));
  q.tradable=true;delete q.executionModel;await assert.rejects(game.trade('buy','005930',1));
  assert.equal(game.state.cash,30000);
});
test('HTTP 서버는 비밀 파일·외부 출처·실제 주문 경로 차단',async()=>{
  const server=createServer({getQuote:async code=>({code,price:10000})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const http=require('node:http');
  const request=(route,headers={},method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:route,method,headers:{Host:'127.0.0.1:4173',...headers}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);req.end();
  });
  try{
    assert.equal((await request('/api/market/status')).status,200);
    assert.equal((await request('/api/market/quote?code=005930',{Origin:'null'})).status,200);
    for(const name of ['/kis-vault.ps1','/kis-market.cjs','/assets/backgrounds/제작_프롬프트.json','/.busangi-private/kis-credentials.dpapi.json'])assert.equal((await request(encodeURI(name))).status,403);
    assert.equal((await request('/api/order',{},'POST')).status,405);
    assert.equal((await request('/api/market/status',{Origin:'https://external.example'})).status,403);
    assert.equal((await request('/api/market/status',{Host:'external.example:4173'})).status,403);
    assert.equal((await request('/index.html')).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
