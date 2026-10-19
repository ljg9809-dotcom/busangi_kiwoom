'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {KisMarket}=require('./kis-market.cjs');
const {AccountStore}=require('./account-store.cjs');
const {Plaza}=require('./plaza-server.cjs');
const PORT=Number(process.env.PORT)||4173,ROOT=__dirname;
const publicOrigin=process.env.BUSANGI_PUBLIC_ORIGIN?new URL(process.env.BUSANGI_PUBLIC_ORIGIN).origin:null;
const hosts=new Set(['127.0.0.1:'+PORT,'localhost:'+PORT,...(publicOrigin?[new URL(publicOrigin).host]:[])]);
const origins=new Set(['null','http://127.0.0.1:'+PORT,'http://localhost:'+PORT,...(publicOrigin?[publicOrigin]:[])]);
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ttf':'font/ttf','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wav':'audio/wav'};
const PUBLIC=new Set(['index.html','scenes-preview.html','actions-preview.html','wardrobe-preview.html','style.css','busangi-game.js','busangi-ui.js','construction-scene.js','cafe-rhythm.js','cafe-track.js','cafe-controller.js','scene-assets.js','market-client.js','wardrobe-renderer.js','account-client.js','station-controller.js','stock-search.js']);
function readJSON(req){return new Promise((resolve,reject)=>{let body='',size=0;req.on('data',d=>{size+=d.length;if(size>300000){reject(Error('요청이 너무 커.'));req.destroy();}else body+=d;});req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(Error('요청 형식을 확인해줘.'));}});req.on('error',()=>reject(Error('요청을 읽지 못했어.')));});}
function createServer(market,options={}){
  const accounts=options.accounts||new AccountStore(),plaza=new Plaza(),drafts=new Map(),attempts=new Map();let authBusy=0;
  const server=http.createServer(async(req,res)=>{
    const host=req.headers.host;
    if(!hosts.has(host)){res.writeHead(403).end();return;}
    const origin=req.headers.origin;
    if(origin&&!origins.has(origin)){res.writeHead(403).end();return;}
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    const json=(status,data)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(data));};
    if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Plaza-Token, X-Busangi-Request'}).end();return;}
    let url;try{url=new URL(req.url,'http://127.0.0.1:'+PORT);decodeURIComponent(url.pathname);}catch{json(400,{error:'잘못된 주소야.'});return;}
    const sessionToken=/(?:^|;\s*)busangi_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
    const user=accounts.user(sessionToken);
    if(url.pathname.startsWith('/api/auth/')||url.pathname==='/api/save'){
      if(origin==='null'){json(403,{error:'계정 저장은 게임 서버 주소에서 이용해줘.'});return;}
      try{
        if(req.method==='GET'&&url.pathname==='/api/auth/session'){json(200,{user,...(user?accounts.load(user):{state:null,revision:0})});return;}
        if(req.method!=='POST'||req.headers['x-busangi-request']!=='1'){json(405,{error:'지원하지 않는 요청이야.'});return;}
        const body=await readJSON(req);
        if(url.pathname==='/api/auth/logout'){accounts.logout(sessionToken);headers['Set-Cookie']='busangi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';json(200,{ok:true});return;}
        if(url.pathname==='/api/save'){
          if(!user){json(401,{error:'로그인 후 저장할 수 있어.'});return;}
          if(!Number.isSafeInteger(body.revision)||body.revision<0)throw Error('저장 버전을 확인해줘.');
          json(200,{revision:accounts.save(user,body.state,body.revision)});return;
        }
        if(!['/api/auth/register','/api/auth/login'].includes(url.pathname)){json(404,{error:'지원하지 않는 기능이야.'});return;}
        const ip=req.socket.remoteAddress,previous=attempts.get(ip)||{at:Date.now(),count:0};if(Date.now()-previous.at>60000){previous.at=Date.now();previous.count=0;}previous.count++;attempts.set(ip,previous);
        if(previous.count>20||authBusy>=4){json(429,{error:'잠시 후 다시 시도해줘.'});return;}
        authBusy++;let logged;
        try{logged=url.pathname.endsWith('/register')?await accounts.register(body.nickname,body.password):await accounts.login(body.nickname,body.password);}finally{authBusy--;}
        const token=accounts.session(logged);headers['Set-Cookie']='busangi_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800'+(req.socket.encrypted||publicOrigin?.startsWith('https:')?'; Secure':'');
        json(200,{user:logged,...accounts.load(logged)});return;
      }catch(e){json(e.message==='SAVE_CONFLICT'?409:400,{error:e.message==='SAVE_CONFLICT'?'다른 창에서 저장 내용이 바뀌었어. 새로고침 후 이어서 해줘.':e.message});return;}
    }
    if(url.pathname==='/api/transfer'){
      try{
        for(const [id,d]of drafts)if(Date.now()-d.at>600000)drafts.delete(id);
        if(req.method==='POST'){
          if(drafts.size>=30)throw Error('잠시 후 다시 이동해줘.');
          const {state}=await readJSON(req);accounts.validate(state);const id=require('node:crypto').randomBytes(24).toString('hex');drafts.set(id,{state,at:Date.now()});json(200,{id});return;
        }
        if(req.method==='GET'){const id=url.searchParams.get('id'),draft=drafts.get(id);if(!draft)throw Error('진행 상황 이동 시간이 지났어. 기존 게임에서 다시 이동해줘.');drafts.delete(id);json(200,{state:draft.state});return;}
      }catch(e){json(400,{error:e.message});return;}
    }
    if(url.pathname.startsWith('/api/plaza/')){
      try{
        if(req.method==='GET'&&url.pathname==='/api/plaza/events'){plaza.stream(url.searchParams.get('id'),req,res,headers);return;}
        if(req.method!=='POST'){json(405,{error:'지원하지 않는 요청이야.'});return;}
        const b=await readJSON(req),token=req.headers['x-plaza-token'];
        if(url.pathname==='/api/plaza/join'){json(200,plaza.join(b.profile,user));return;}
        if(url.pathname==='/api/plaza/update'){json(200,plaza.update(b.id,token,b));return;}
        if(url.pathname==='/api/plaza/chat'){json(200,plaza.chat(b.id,token,b.text));return;}
        if(url.pathname==='/api/plaza/leave'){plaza.owner(b.id,token);plaza.leave(b.id);json(200,{ok:true});return;}
        json(404,{error:'지원하지 않는 기능이야.'});return;
      }catch(e){json(400,{error:e.message});return;}
    }
    if(!['GET','HEAD'].includes(req.method)){json(405,{error:'시세 조회만 지원해.'});return;}
    if(url.pathname==='/api/market/status'){
      const status=market.health?await market.health():{connected:true};
      json(200,{...status,mode:'current-price',source:'한국투자증권 · 시세 조회 전용'});return;
    }
    if(url.pathname==='/api/market/quote'){
      try{json(200,await market.getQuote(url.searchParams.get('code')||''));}catch(e){json(503,{error:e.message});}return;
    }
    if(url.pathname.startsWith('/api/')){json(404,{error:'지원하지 않는 기능이야.'});return;}
    const name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
    const segments=name.split(/[\\/]/);
    const ext=path.extname(name).toLowerCase();
    if(segments.some(x=>!x||x.startsWith('.'))||(!PUBLIC.has(name)&&!(name.startsWith('assets/')&&TYPES[ext]))||!TYPES[ext]){res.writeHead(403,headers).end();return;}
    const file=path.resolve(ROOT,name);
    if(!file.startsWith(ROOT+path.sep)){res.writeHead(403,headers).end();return;}
    fs.stat(file,(err,stat)=>{
      if(err||!stat.isFile()){res.writeHead(404,headers).end();return;}
      const h={...headers,'Content-Type':TYPES[ext],'Accept-Ranges':'bytes'};
      const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');let start=0,end=stat.size-1;
      if(range){start=Number(range[1]);end=Math.min(end,range[2]?Number(range[2]):end);if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();return;}h['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;}
      h['Content-Length']=end-start+1;res.writeHead(range?206:200,h);if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).pipe(res);
    });
  });
  server.on('close',()=>{plaza.close();accounts.close();});return server;
}
async function main(){
  const market=new KisMarket();let initialized=false,connected=false,lastAttempt=0,lastError='',pending;
  // An unavailable quote provider must never prevent the game itself from opening.
  market.health=async()=>{
    if(connected)return {connected:true};
    if(pending)return pending;
    if(Date.now()-lastAttempt<10000)return {connected:false,error:lastError};
    pending=(async()=>{lastAttempt=Date.now();try{
      if(!initialized){await market.init();initialized=true;}
      await market.getQuote('005930');connected=true;return {connected:true};
    }catch(e){lastError=e.message;return {connected:false,error:lastError};}})();
    try{return await pending;}finally{pending=null;}
  };
  const status=await market.health();
  console.log(status.connected?'KIS 현재가 연결 확인 완료':'현재가 연결 대기 · 게임 화면은 이용 가능');
  const privateDir=process.env.BUSANGI_DATA_DIR?path.resolve(process.env.BUSANGI_DATA_DIR):path.resolve(ROOT,'..','.busangi-private');fs.mkdirSync(privateDir,{recursive:true});
  const server=createServer(market,{accounts:new AccountStore(path.join(privateDir,'accounts.sqlite'))});
  server.on('error',()=>{console.error('서버를 열 수 없어. 4173 포트를 사용하는 창을 확인해줘.');process.exitCode=1;});
  server.listen(PORT,process.env.BUSANGI_BIND||'127.0.0.1',()=>console.log('부산기 게임: '+(publicOrigin||'http://127.0.0.1:'+PORT)+'/#home'));
}
if(require.main===module)main().catch(e=>{console.error('시세 연결 실패: '+e.message);process.exitCode=1;});
module.exports={createServer};
