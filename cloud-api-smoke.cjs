// Explicit remote smoke test; disposable IDs are printed for exact fixture cleanup.
'use strict';
const assert=require('node:assert/strict'),{randomBytes}=require('node:crypto'),game=require('./busangi-game.js');
const base=process.env.BUSANGI_SMOKE_URL;if(!base)throw Error('BUSANGI_SMOKE_URL is required');
const origin=process.env.BUSANGI_SMOKE_ORIGIN||'https://busangikiwoom.vercel.app';
const ids=[],players=[];
async function main(){
 const suffix=randomBytes(5).toString('hex'),password=randomBytes(20).toString('hex');
 async function call(path,body,cookie,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json','X-Busangi-Request':'1'}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{'X-Plaza-Token':token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const a=await call('/api/auth/register',{nickname:'검증★,'+suffix,password});assert.equal(a.status,200,JSON.stringify(a.data));ids.push(a.data.user.id);assert.ok(a.cookie);
 const state=game.create({storage:null,load:false}).state;
 const saved=await call('/api/save',{state,revision:0},a.cookie);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.revision,1);
 assert.equal((await call('/api/save',{state,revision:0},a.cookie)).status,409);
 assert.equal((await call('/api/save',{state,revision:1})).status,401);
 const login=await call('/api/auth/login',{nickname:'검증★,'+suffix,password});assert.equal(login.status,200,JSON.stringify(login.data));assert.equal(login.data.revision,1);assert.equal(login.data.state.nickname,'검증★,'+suffix);
 const b=await call('/api/auth/register',{nickname:'검증2-'+suffix,password});assert.equal(b.status,200,JSON.stringify(b.data));ids.push(b.data.user.id);
 const pa=await call('/api/plaza/join',{profile:{nickname:'forged',equipped:{},health:50}},login.cookie);assert.equal(pa.status,200,JSON.stringify(pa.data));players.push(pa.data.id);
 const pb=await call('/api/plaza/join',{profile:{}},b.cookie);assert.equal(pb.status,200,JSON.stringify(pb.data));players.push(pb.data.id);
 const wrong=await call('/api/plaza/update',{id:pa.data.id,x:60,direction:1},b.cookie,pa.data.token);assert.equal(wrong.status,400);
 assert.equal((await call('/api/plaza/update',{id:pa.data.id,x:60,direction:1},login.cookie,pa.data.token)).status,200);
 assert.equal((await call('/api/plaza/chat',{id:pa.data.id,text:'연결 검증 '+suffix},login.cookie,pa.data.token)).status,200);
 const poll=await call('/api/plaza/poll?id='+pb.data.id+'&cursor='+pb.data.cursor,undefined,b.cookie,pb.data.token);assert.equal(poll.status,200,JSON.stringify(poll.data));assert.ok(poll.data.players.some(p=>p.profile.nickname==='검증★,'+suffix));assert.ok(poll.data.messages.some(m=>m.text==='연결 검증 '+suffix));
 const rank=await call('/api/ranking',undefined,login.cookie);assert.equal(rank.status,200,JSON.stringify(rank.data));assert.ok(!JSON.stringify(rank.data).includes('password_hash'));
 const q=await call('/api/market/quote?code=005930');assert.equal(q.status,200,JSON.stringify(q.data));
 for(const [p,c]of [[pa,login.cookie],[pb,b.cookie]])assert.equal((await call('/api/plaza/leave',{id:p.data.id},c,p.data.token)).status,200);
 await call('/api/auth/logout',{},login.cookie);assert.equal((await call('/api/auth/session',undefined,login.cookie)).data.user,null);
 console.log('PASS: signup, punctuation nickname login, save/relogin, revision conflict, authorization, two-player chat/movement, ranking, real quote, logout');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>console.log(JSON.stringify({cleanupUserIds:ids,cleanupPlayerIds:players})));
