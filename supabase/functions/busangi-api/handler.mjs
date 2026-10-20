import {randomBytes,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {Buffer} from 'node:buffer';
import './game-rules.js';
import {leaderboard,getRankingQuotes} from './ranking.mjs';
import {KisMarket} from './kis-market.mjs';
const derive=promisify(scrypt),API=globalThis.BusangiGame,validator=API.create({storage:null,load:false});
const env=name=>Deno.env.get(name),hash=s=>createHash('sha256').update(s).digest('hex');
const serviceKey=()=>{try{return JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default||env('SUPABASE_SERVICE_ROLE_KEY');}catch{return env('SUPABASE_SERVICE_ROLE_KEY');}};
export class CloudDB {
 async query(route,method='GET',body,extra={}){
  const key=serviceKey();if(!key)throw Error('서버 저장 연결을 확인해줘.');
  let r;try{r=await fetch(env('SUPABASE_URL')+'/rest/v1/'+route,{method,headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',Prefer:'return=representation',...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw Error('저장 서버에 연결하지 못했어. 잠시 후 다시 시도해줘.');}
  const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{throw Error('저장 서버 응답을 확인해줘.');}
  if(!r.ok){const known=['SAVE_CONFLICT','PLAZA_FULL','PLAZA_EXPIRED','CHAT_RATE','CHAT_LENGTH'];const e=Error(known.includes(data?.message)?data.message:'저장 요청을 처리하지 못했어.');e.code=data?.code;throw e;}
  return data;
 }
 rpc(name,args={}){return this.query('rpc/'+name,'POST',args);}
 async rate(bucket,limit,seconds=60){if(!await this.rpc('busangi_rate',{p_bucket:bucket,p_limit:limit,p_seconds:seconds}))throw Error('요청이 많아. 잠시 후 다시 시도해줘.');}
}
const db=new CloudDB();
function validate(state){validator.validateSave(state);if(JSON.stringify(state).length>250000)throw Error('저장 데이터가 너무 커.');return state;}
export function validName(name){if(typeof name!=='string'||!name.trim()||Array.from(name.trim().normalize('NFC')).length>80)throw Error('닉네임은 1~80자로 입력해줘.');return name.trim().normalize('NFC');}
async function currentUser(token){if(!token)return null;const rows=await db.query('busangi_sessions?token_hash=eq.'+hash(token)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=user_id,user:busangi_users(id,nickname)&limit=1');return rows[0]?.user||null;}
async function load(user){const rows=await db.query('busangi_saves?user_id=eq.'+user.id+'&select=state,revision&limit=1');return rows[0]||{state:null,revision:0};}
async function save(user,state,revision){if(!Number.isSafeInteger(revision)||revision<0)throw Error('저장 버전을 확인해줘.');validate(state);return db.rpc('busangi_save',{p_user:user.id,p_state:{...state,nickname:user.nickname},p_revision:revision});}
export function cleanProfile(profile={},user){
 const p=profile&&typeof profile==='object'?profile:{},equipped={};for(const [slot,id]of Object.entries(p.equipped||{}))if(API.data.clothes.some(c=>c.id===id&&c.slot===slot))equipped[slot]=id;
 const stat=k=>Number.isInteger(p[k])?Math.max(0,Math.min(100,p[k])):0,amount=x=>Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER?Math.floor(x):null;
 return {nickname:user?.nickname||String(p.nickname||'부산기').slice(0,80),equipped,job:API.data.jobs.some(j=>j.id===p.job)?p.job:null,health:stat('health'),mental:stat('mental'),intelligence:stat('intelligence'),portfolio:{cash:amount(p.portfolio?.cash),total:amount(p.portfolio?.total)}};
}
async function aesKey(){return crypto.subtle.importKey('raw',new Uint8Array(createHash('sha256').update(env('KIS_APP_SECRET')||'').digest()),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function tokenRead(){const rows=await db.query('busangi_kis_tokens?id=eq.1&select=ciphertext,expires_at');const row=rows[0];if(!row?.ciphertext||Date.parse(row.expires_at)<Date.now()+60000)return null;try{const bytes=Buffer.from(row.ciphertext,'base64');const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},await aesKey(),bytes.subarray(12));return JSON.parse(new TextDecoder().decode(decoded));}catch{return null;}}
async function cloudVault(mode,input){
 if(mode==='credentials')return {appKey:env('KIS_APP_KEY'),appSecret:env('KIS_APP_SECRET')};
 if(mode==='token-read'){
  const saved=await tokenRead();if(saved)return saved;
  if(await db.rpc('busangi_kis_lease'))return {};
  for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,500));const shared=await tokenRead();if(shared)return shared;}
  throw Error('시세 인증을 준비 중이야. 잠시 후 다시 조회해줘.');
 }
 if(mode==='token-write'){
  const token=JSON.parse(input),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(),new TextEncoder().encode(input));
  await db.query('busangi_kis_tokens?id=eq.1','PATCH',{ciphertext:Buffer.concat([Buffer.from(iv),Buffer.from(cipher)]).toString('base64'),expires_at:new Date(token.expiresAt).toISOString(),lease_until:null});return {};
 }
 throw Error('지원하지 않는 키 저장 요청이야.');
}
const market=new KisMarket({vaultImpl:cloudVault});let marketReady=false;
async function quote(code){
 if(!/^\d{6}$/.test(code))throw Error('종목코드는 숫자 6자리로 입력해줘.');
 const cached=await db.query('busangi_quotes?code=eq.'+code+'&select=payload&limit=1');if(cached[0]?.payload&&Date.now()-cached[0].payload.timestamp<10000)return cached[0].payload;
 if(!marketReady){await market.init();marketReady=true;}const q=await market.getQuote(code);
 await db.query('busangi_quotes?on_conflict=code','POST',{code,payload:q,updated_at:new Date().toISOString()},{Prefer:'resolution=merge-duplicates,return=minimal'});return q;
}
async function body(req){const length=Number(req.headers.get('content-length'));if(length>300000)throw Error('요청이 너무 커.');const reader=req.body?.getReader();if(!reader)return {};const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>300000){await reader.cancel();throw Error('요청이 너무 커.');}chunks.push(Buffer.from(value));}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Error('입력 내용을 확인해줘.');}}
async function owner(id,token,user){if(!/^[0-9a-f-]{36}$/.test(id||'')||!/^[0-9a-f]{48}$/.test(token||''))throw Error('PLAZA_EXPIRED');const rows=await db.query('busangi_plaza_players?id=eq.'+id+'&token_hash=eq.'+hash(token)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=id,user_id,profile&limit=1');const p=rows[0];if(!p||p.user_id&&p.user_id!==user?.id)throw Error('PLAZA_EXPIRED');return p;}
const message={SAVE_CONFLICT:'다른 창에서 저장 내용이 바뀌었어. 새로고침 후 이어서 해줘.',PLAZA_FULL:'광장이 가득 찼어. 잠시 후 다시 들어와줘.',PLAZA_EXPIRED:'광장에 다시 입장해줘.',CHAT_RATE:'메시지는 잠시 간격을 두고 보내줘.',CHAT_LENGTH:'메시지는 1~200자로 입력해줘.'};
export async function handler(req){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const json=(status,data)=>new Response(JSON.stringify(data),{status,headers});
 const origin=req.headers.get('origin'),allowed=(env('BUSANGI_ALLOWED_ORIGINS')||'https://busangikiwoom.vercel.app').split(',').map(s=>s.trim());
 if(origin&&!allowed.includes(origin))return json(403,{error:'허용되지 않은 접속 주소야.'});
 if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Vary']='Origin';headers['Access-Control-Allow-Credentials']='true';}
 if(req.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type, X-Plaza-Token, X-Busangi-Request';return new Response(null,{status:204,headers});}
 const url=new URL(req.url),path=url.pathname.replace(/^.*\/busangi-api(?=\/|$)/,'').replace(/\/$/,'');
 const cookie=/(?:^|;\s*)busangi_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get('cookie')||'')?.[1];
 try{
  if(path==='/api/health'&&req.method==='GET'){await db.query('busangi_users?select=id&limit=0');return json(200,{ok:true,service:'busangi-cloud',accounts:true});}
  const user=await currentUser(cookie);
  if(path.startsWith('/api/auth/')||path==='/api/save'){
   if(req.method==='GET'&&path==='/api/auth/session')return json(200,{user,...(user?await load(user):{state:null,revision:0})});
   if(req.method!=='POST'||req.headers.get('x-busangi-request')!=='1')return json(405,{error:'지원하지 않는 요청이야.'});
   const b=await body(req);
   if(path==='/api/auth/logout'){if(cookie)await db.query('busangi_sessions?token_hash=eq.'+hash(cookie),'DELETE');headers['Set-Cookie']='busangi_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';return json(200,{ok:true});}
   if(path==='/api/save'){if(!user)return json(401,{error:'로그인 후 저장할 수 있어.'});await db.rate('save:'+user.id,120);return json(200,{revision:await save(user,b.state,b.revision)});}
   if(!['/api/auth/register','/api/auth/login'].includes(path))return json(404,{error:'지원하지 않는 기능이야.'});
   const nickname=validName(b.nickname),password=b.password;
   if(typeof password!=='string'||password.length<8||password.length>256)throw Error('비밀번호는 8~256자로 입력해줘.');
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('x-real-ip')||'unknown';
   await db.rate('auth-ip:'+hash(ip),30);await db.rate('auth-name:'+hash(nickname),12);
   let logged;
   if(path.endsWith('/register')){
    await db.rate('registration-global',200,3600);
    const salt=randomBytes(16).toString('hex'),password_hash=Buffer.from(await derive(password,salt,64)).toString('hex');
    try{const rows=await db.query('busangi_users','POST',{nickname,salt,password_hash});logged={id:rows[0].id,nickname:rows[0].nickname};}catch(e){if(e.code==='23505')throw Error('이미 사용 중인 닉네임이야.');throw e;}
   }else{
    const rows=await db.rpc('busangi_login_lookup',{p_nickname:nickname});const row=rows[0];
    const computed=Buffer.from(await derive(password,row?.salt||'missing-user-fixed-salt',64));
    if(!row||!timingSafeEqual(computed,Buffer.from(row.password_hash,'hex')))throw Error('닉네임과 비밀번호를 확인해줘.');logged={id:row.id,nickname:row.nickname};
   }
   const token=randomBytes(32).toString('hex');await db.query('busangi_sessions','POST',{token_hash:hash(token),user_id:logged.id,expires_at:new Date(Date.now()+7*86400000).toISOString()});
   await db.query('busangi_sessions?expires_at=lt.'+encodeURIComponent(new Date().toISOString()),'DELETE');
   headers['Set-Cookie']='busangi_session='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800';return json(200,{user:logged,...await load(logged)});
  }
  if(path==='/api/transfer'){
   if(req.method==='POST'){const b=await body(req);validate(b.state);await db.rate('transfer-global',100);const id=randomBytes(24).toString('hex');await db.query('busangi_transfers','POST',{id,state:b.state,expires_at:new Date(Date.now()+600000).toISOString()});return json(200,{id});}
   if(req.method==='GET'){const id=url.searchParams.get('id');if(!/^[a-f0-9]{48}$/.test(id||''))throw Error('진행 상황 이동 주소를 확인해줘.');const state=await db.rpc('busangi_take_transfer',{p_id:id});if(!state)throw Error('진행 상황 이동 시간이 지났어.');return json(200,{state});}
  }
  if(path==='/api/ranking'&&req.method==='GET'){
   const page=Number(url.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1)throw Error('페이지 번호를 확인해줘.');
   const rows=[];for(let offset=0;offset<100000;offset+=1000){const batch=await db.query('busangi_saves?select=user_id,state,user:busangi_users(nickname)&order=user_id&limit=1000&offset='+offset);for(const s of batch)rows.push({id:s.user_id,nickname:s.user.nickname,state:JSON.stringify(s.state)});if(batch.length<1000)break;}
   const cached=await db.query('busangi_quotes?select=code,payload'),cache=new Map(cached.map(q=>[q.code,q.payload]));const v=await getRankingQuotes(rows,{getQuote:quote},cache);
   return json(200,{...leaderboard(rows,user?.id,page,v.quotes),valuationAt:v.valuationAt,stale:v.stale});
  }
  if(path.startsWith('/api/plaza/')){
   const action=path.split('/').pop();
   if(action==='poll'&&req.method==='GET'){
    const id=url.searchParams.get('id'),cursor=Number(url.searchParams.get('cursor')||0),token=req.headers.get('x-plaza-token');
    if(!Number.isSafeInteger(cursor)||cursor<0)throw Error('채팅 위치를 확인해줘.');await owner(id,token,user);
    return json(200,await db.rpc('busangi_plaza_poll',{p_id:id,p_hash:hash(token),p_cursor:cursor}));
   }
   if(req.method!=='POST')return json(405,{error:'지원하지 않는 요청이야.'});
   const b=await body(req),token=req.headers.get('x-plaza-token');
   if(action==='join'){
    await db.rate('plaza-join:'+hash(user?.id||req.headers.get('x-forwarded-for')||'guest'),20);
    const id=crypto.randomUUID(),secret=randomBytes(24).toString('hex'),profile=cleanProfile(b.profile,user);if(!user)profile.nickname+=' · 게스트 '+id.slice(0,4);
    const joined=await db.rpc('busangi_plaza_join',{p_id:id,p_hash:hash(secret),p_user:user?.id||null,p_profile:profile});return json(200,{id,token:secret,polling:true,...joined});
   }
   const p=await owner(b.id,token,user);
   if(action==='update'){
    await db.rate('move:'+p.id,360);let profile=b.profile?cleanProfile(b.profile,user):null;if(profile)profile.nickname=p.profile.nickname;
    await db.rpc('busangi_plaza_update',{p_id:p.id,p_hash:hash(token),p_x:Number.isFinite(b.x)?b.x:null,p_direction:b.direction,p_profile:profile});return json(200,{ok:true});
   }
   if(action==='chat'){if(typeof b.text!=='string')throw Error('메시지를 입력해줘.');await db.rpc('busangi_plaza_chat',{p_id:p.id,p_hash:hash(token),p_text:b.text});return json(200,{ok:true});}
   if(action==='leave'){await db.query('busangi_plaza_players?id=eq.'+p.id+'&token_hash=eq.'+hash(token),'DELETE');return json(200,{ok:true});}
  }
  if(path==='/api/market/status'&&req.method==='GET'){
   try{await quote('005930');return json(200,{connected:true,mode:'current-price',source:'한국투자증권 · 시세 조회 전용'});}catch(e){return json(200,{connected:false,error:e.message,mode:'current-price'});}
  }
  if(path==='/api/market/quote'&&req.method==='GET'){await db.rate('quote-global',120);return json(200,await quote(url.searchParams.get('code')||''));}
  return json(404,{error:'지원하지 않는 기능이야.'});
 }catch(e){const text=message[e.message]||e.message;return json(e.message==='SAVE_CONFLICT'?409:400,{error:text});}
}

