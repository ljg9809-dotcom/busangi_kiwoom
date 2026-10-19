'use strict';
const {randomBytes,timingSafeEqual}=require('node:crypto');
const clothes=require('./busangi-game.js').data.clothes;
function cleanProfile(p={},user){
  const equipped={};for(const [slot,id]of Object.entries(p.equipped||{}))if(clothes.some(c=>c.id===id&&c.slot===slot))equipped[slot]=id;
  const stat=k=>Number.isInteger(p[k])?Math.max(0,Math.min(100,p[k])):0;
  const amount=x=>Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER?Math.floor(x):null;
  return {nickname:user?.nickname||String(p.nickname||'부산기').slice(0,80),equipped,job:typeof p.job==='string'?p.job.slice(0,30):null,health:stat('health'),mental:stat('mental'),intelligence:stat('intelligence'),portfolio:{cash:amount(p.portfolio?.cash),total:amount(p.portfolio?.total)}};
}
class Plaza{
  constructor(){this.players=new Map();}
  public(p){return {id:p.id,profile:p.profile,x:p.x,direction:p.direction};}
  broadcast(event){const data='data: '+JSON.stringify(event)+'\n\n';for(const p of this.players.values())if(p.res&&!p.res.destroyed)p.res.write(data);}
  snapshot(){this.broadcast({type:'players',players:[...this.players.values()].map(p=>this.public(p))});}
  join(profile,user){
    if(user)for(const p of this.players.values())if(p.user?.id===user.id)this.leave(p.id);
    if(this.players.size>=30)throw Error('광장이 가득 찼어. 잠시 후 다시 들어와줘.');
    const id=randomBytes(12).toString('hex'),token=randomBytes(24).toString('hex');
    const cleaned=cleanProfile(profile,user);if(!user)cleaned.nickname+=' · 게스트 '+id.slice(0,4);
    this.players.set(id,{id,token,user,profile:cleaned,x:17+(this.players.size%5)*16+Math.random()*2,direction:1,lastMove:Date.now(),lastChat:0,lastSeen:Date.now(),res:null});this.snapshot();
    return {id,token,players:[...this.players.values()].map(p=>this.public(p))};
  }
  owner(id,token){const p=this.players.get(id);if(!p||typeof token!=='string'||token.length!==p.token.length||!timingSafeEqual(Buffer.from(token),Buffer.from(p.token)))throw Error('광장에 다시 입장해줘.');p.lastSeen=Date.now();return p;}
  stream(id,req,res,headers){
    const p=this.players.get(id);if(!p){res.writeHead(404).end();return;}
    clearTimeout(p.cleanup);if(p.res)p.res.end();p.res=res;
    res.writeHead(200,{...headers,'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 2000\n\n');
    res.write('data: '+JSON.stringify({type:'players',players:[...this.players.values()].map(p=>this.public(p))})+'\n\n');
    const ping=setInterval(()=>res.write(': heartbeat\n\n'),15000);
    req.on('close',()=>{clearInterval(ping);if(p.res===res){p.res=null;p.cleanup=setTimeout(()=>{if(!p.res)this.leave(id);},5000);}});
  }
  update(id,token,data){
    const p=this.owner(id,token),now=Date.now();
    if(data.profile){const nick=p.profile.nickname;p.profile=cleanProfile(data.profile,p.user);if(!p.user)p.profile.nickname=nick;}
    if(Number.isFinite(data.x)){const max=3+Math.min(1000,now-p.lastMove)*.04;p.x=Math.max(7,Math.min(93,p.x+Math.max(-max,Math.min(max,data.x-p.x))));p.lastMove=now;}
    p.direction=data.direction===-1?-1:1;this.snapshot();return {ok:true};
  }
  chat(id,token,text){const p=this.owner(id,token);if(typeof text!=='string'||!text.trim()||text.length>200)throw Error('메시지는 1~200자로 입력해줘.');if(Date.now()-p.lastChat<800)throw Error('메시지는 잠시 간격을 두고 보내줘.');p.lastChat=Date.now();this.broadcast({type:'message',id,nickname:p.profile.nickname,text:text.trim(),at:Date.now()});return {ok:true};}
  leave(id){const p=this.players.get(id);if(!p)return;clearTimeout(p.cleanup);this.players.delete(id);p.res?.end();this.snapshot();}
  close(){for(const id of [...this.players.keys()])this.leave(id);}
}
module.exports={Plaza,cleanProfile};
