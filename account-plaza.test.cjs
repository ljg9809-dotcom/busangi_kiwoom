'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {AccountStore}=require('./account-store.cjs'),{Plaza}=require('./plaza-server.cjs');
const api=require('./busangi-game.js'),search=require('./stock-search.js');
test('기호·한글 닉네임 가입, 비밀번호 검증, 계정별 저장·재로그인·동시 저장 충돌',async()=>{
  const accounts=new AccountStore();
  try{
    const a=await accounts.register('부산기 !@#★','test-password-only'),b=await accounts.register('Other+123','test-password-two');
    assert.equal((await accounts.login('부산기 !@#★','test-password-only')).id,a.id);
    await assert.rejects(accounts.login(a.nickname,'wrong-password'));
    await assert.rejects(accounts.register(a.nickname,'duplicate-password'));
    const token=accounts.session(a);assert.equal(accounts.user(token).id,a.id);assert.equal(accounts.user('invalid'),null);
    const game=api.create({storage:null});game.state.cash=70000;game.buyClothing('hoodie');
    assert.equal(accounts.save(a,game.state,0),1);assert.equal(accounts.load(a).state.equipped.top,'hoodie');assert.equal(accounts.load(a).state.cash,40000);
    assert.equal(accounts.load(a).state.nickname,a.nickname);assert.equal(accounts.load(b).state,null);
    assert.throws(()=>accounts.save(a,game.state,0));assert.throws(()=>accounts.save(a,game.state,99));
    assert.equal(accounts.save(a,game.state,1),2);accounts.logout(token);assert.equal(accounts.user(token),null);
    const hash=accounts.db.prepare('SELECT password_hash FROM users WHERE id=?').get(a.id).password_hash;assert.notEqual(hash,'test-password-only');
  }finally{accounts.close();}
});
test('광장 플레이어 의상·이동·채팅 공유와 소유권 검증',()=>{
  const plaza=new Plaza(),events=[];
  try{
    const a=plaza.join({nickname:'보내는 부산기',equipped:{top:'hoodie',shoes:'sneakers'},health:60,mental:80,intelligence:25},{id:'a',nickname:'실제 닉네임'});
    const b=plaza.join({nickname:'두번째 부산기'});plaza.broadcast=e=>events.push(e);
    plaza.update(a.id,a.token,{x:70,direction:-1});assert.equal(plaza.players.get(a.id).direction,-1);assert.equal(plaza.players.get(a.id).profile.equipped.top,'hoodie');
    assert.equal(plaza.players.get(a.id).profile.nickname,'실제 닉네임');assert.throws(()=>plaza.update(a.id,b.token,{x:30}));
    plaza.chat(a.id,a.token,'<script>텍스트로만 표시</script>');assert.equal(events.at(-1).text,'<script>텍스트로만 표시</script>');assert.equal(events.at(-1).nickname,'실제 닉네임');
    plaza.leave(a.id);assert.equal(plaza.players.size,1);
  }finally{plaza.close();}
});
test('공식 종목 목록으로 한글·영문·띄어쓰기·종목코드 검색',()=>{
  const scope={};require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'assets/stocks/directory.js'),'utf8'),{window:scope});
  const list=scope.BusangiStockDirectory.stocks;assert.ok(list.length>3000);
  assert.equal(search.resolve(list,'삼성전자'),'005930');assert.equal(search.resolve(list,'BNK 금융지주'),'138930');assert.equal(search.resolve(list,'jyp ent.'),'035900');
  assert.ok(search.search(list,'삼성').some(s=>s.code==='005930'));assert.equal(search.resolve(list,'005930'),'005930');assert.equal(search.resolve(list,'없는종목이름'),null);
});
test('공부 59초+1초 누적, 시간당 저장 기록의 분 단위 전환',()=>{
  let now=10000000;const storageMap=new Map(),storage={getItem:k=>storageMap.get(k),setItem:(k,v)=>storageMap.set(k,v)};
  const game=api.create({storage,now:()=>now});game.startStudy();now+=59000;game.tick();assert.equal(game.state.intelligence,0);now+=1000;game.pauseStudy();assert.equal(game.state.intelligence,1);
  game.state.study.remainderMs=90000;delete game.state.study.rateVersion;game.save();const loaded=api.create({storage,now:()=>now});assert.equal(loaded.state.intelligence,2);assert.equal(loaded.state.study.remainderMs,30000);loaded.save();const again=api.create({storage,now:()=>now});assert.equal(again.state.intelligence,2);
});
test('HTTP 회원가입·쿠키 세션·재로그인 저장 복원·파일 진행 이동',async()=>{
  const {createServer}=require('./market-server.cjs'),http=require('node:http');
  const server=createServer({getQuote:async()=>({})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  const call=(route,body,cookie='',origin='http://127.0.0.1:4173')=>new Promise((resolve,reject)=>{const request=http.request({host:'127.0.0.1',port,path:route,method:body?'POST':'GET',headers:{Host:'127.0.0.1:4173',Origin:origin,'Content-Type':'application/json','X-Busangi-Request':'1',Cookie:cookie}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),cookie:res.headers['set-cookie']?.[0].split(';')[0]}));});request.on('error',reject);request.end(body?JSON.stringify(body):undefined);});
  try{
    const registered=await call('/api/auth/register',{nickname:'HTTP 테스트★',password:'test-only-pass'});assert.equal(registered.status,200);assert.ok(registered.cookie);assert.equal(registered.data.state,null);
    const game=api.create({storage:null});game.state.cash=54321;
    assert.equal((await call('/api/save',{state:game.state,revision:0},registered.cookie)).data.revision,1);
    const logged=await call('/api/auth/login',{nickname:'HTTP 테스트★',password:'test-only-pass'});assert.equal(logged.data.state.cash,54321);
    assert.equal((await call('/api/auth/session',null,logged.cookie)).data.user.nickname,'HTTP 테스트★');
    assert.equal((await call('/api/auth/session',null,'','null')).status,403);
    assert.equal((await call('/api/save',{state:game.state,revision:0})).status,401);
    const transfer=await call('/api/transfer',{state:game.state},'','null');assert.equal(transfer.status,200);
    assert.equal((await call('/api/transfer?id='+transfer.data.id)).data.state.cash,54321);
    assert.equal((await call('/api/transfer?id='+transfer.data.id)).status,400);
  }finally{await new Promise(r=>server.close(r));}
});
