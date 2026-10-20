(function(root){
  'use strict';
  function create({game,notify}){
    const $=id=>document.getElementById(id),base=location.protocol==='file:'?'http://127.0.0.1:4173':'';
    const arena=$('station-arena'),actors=$('station-actors'),nodes=new Map(),keys=new Set();
    let pollTimer=null,pollCursor=0;
    let active=false,joining=false,joined=null,stream=null,players=[],x=50,direction=1,lastFrame=0,lastSent=0,lastProfile='',moving=false,selected=null;
    async function post(route,body){let r;try{r=await fetch(base+'/api/plaza/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(joined?{'X-Plaza-Token':joined.token}:{})},body:JSON.stringify(body),keepalive:route==='leave',signal:AbortSignal.timeout(10000)});}catch{throw Error('광장 서버 연결을 확인해줘.');}const data=await r.json();if(!r.ok)throw Error(data.error||'광장 연결에 실패했어.');return data;}
    function profileText(p){const job=BusangiGame.data.jobs.find(j=>j.id===p.job)?.name||'취업준비생',money=BusangiGame.formatMoney;return job+' · 재화 '+(p.portfolio?.cash==null?'미평가':money(p.portfolio.cash))+' · 총자산 '+(p.portfolio?.total==null?'미평가':money(p.portfolio.total))+' · 체력 '+p.health+' / 정신력 '+p.mental+' / 지능 '+p.intelligence;}
    function inspect(player){selected=player.id;const panel=$('station-profile');panel.hidden=false;panel.replaceChildren();const name=document.createElement('h3');name.textContent=player.profile.nickname+(player.id===joined?.id?' (나)':'');const info=document.createElement('p');info.textContent=profileText(player.profile);const outfit=document.createElement('p');outfit.textContent='착용: '+(Object.values(player.profile.equipped||{}).map(id=>BusangiGame.data.clothes.find(c=>c.id===id)?.name).filter(Boolean).join(', ')||'기본 부산기');panel.append(name,info,outfit);}
    function drawPlayers(){
      const shown=joined?players:[{id:'local',x,direction,profile:game.publicProfile()}],ids=new Set(shown.map(p=>p.id));
      for(const [id,node]of nodes)if(!ids.has(id)){node.remove();nodes.delete(id);}
      for(const player of shown){
        const self=player.id===(joined?.id||'local');let node=nodes.get(player.id);
        if(!node){node=document.createElement('button');node.type='button';node.className='plaza-player';const image=document.createElement('img');image.draggable=false;const label=document.createElement('span');node.append(image,label);node.onclick=()=>{const p=(joined?players:shown).find(p=>p.id===player.id);if(p)inspect(p);};actors.append(node);nodes.set(player.id,node);}
        node.style.left=(self?x:player.x)+'%';node.classList.toggle('is-self',self);node.classList.toggle('is-walking',self&&moving);node.querySelector('img').style.transform='scaleX('+((self?direction:player.direction)||1)+')';
        node.querySelector('span').textContent=player.profile.nickname+(self?' · 나':'');node.setAttribute('aria-label',player.profile.nickname+' 프로필 보기');
        BusangiWardrobe.apply(node.querySelector('img'),{action:'idle',src:BusangiScenes.characters.idle,alt:player.profile.nickname+'의 부산기'},player.profile.equipped);
        if(selected===player.id)inspect(player);
      }
      $('station-player-count').textContent=(joined?players.length:1)+'명 · '+(joined?'같은 서버의 접속자':'나의 캐릭터 미리보기');
    }
    function chat(event){const line=document.createElement('p');const name=document.createElement('strong');name.textContent=event.nickname+': ';line.append(name,document.createTextNode(event.text));$('chat-log').append(line);while($('chat-log').childElementCount>100)$('chat-log').firstChild.remove();$('chat-log').scrollTop=$('chat-log').scrollHeight;}
    function connected(){ $('station-status').textContent='부산역 광장 연결됨 · ← → 방향키 또는 아래 버튼으로 이동';$('chat-input').disabled=$('chat-send').disabled=false;$('chat-input').placeholder='광장에 있는 사람들에게 인사해봐'; }
    async function poll(){
      const current=joined;if(!active||!current?.polling)return;
      try{
        const response=await fetch(base+'/api/plaza/poll?id='+encodeURIComponent(current.id)+'&cursor='+pollCursor,{headers:{'X-Plaza-Token':current.token},cache:'no-store',signal:AbortSignal.timeout(10000)});
        const data=await response.json();if(!response.ok)throw Error(data.error||'광장 연결을 확인해줘.');
        if(joined?.id!==current.id||!active)return;
        players=data.players;const me=players.find(p=>p.id===current.id);if(me&&!moving)x=me.x;
        for(const event of data.messages||[]){if(event.cursor>pollCursor){chat(event);pollCursor=event.cursor;}}
        connected();drawPlayers();pollTimer=setTimeout(poll,1000);
      }catch(error){
        if(joined?.id!==current.id||!active)return;
        $('station-status').textContent=error.message+' · 다시 연결해줘.';$('chat-input').disabled=$('chat-send').disabled=true;joined=null;players=[];drawPlayers();
      }
    }
    async function join(){
      if(joining||joined)return;joining=true;$('station-status').textContent='부산역 광장에 입장하고 있어…';
      try{
        const result=await post('join',{profile:game.publicProfile()});joined=result;if(!active){leave();return;}players=result.players;x=players.find(p=>p.id===joined.id)?.x||50;
        if(result.polling){pollCursor=result.cursor||0;connected();poll();}
        else {stream=new EventSource(base+'/api/plaza/events?id='+encodeURIComponent(joined.id));
        stream.onmessage=e=>{let event;try{event=JSON.parse(e.data);}catch{return;}if(event.type==='players'){players=event.players;const me=players.find(p=>p.id===joined?.id);if(me&&!moving)x=me.x;drawPlayers();}else if(event.type==='message')chat(event);};
        stream.onopen=()=>{$('station-status').textContent='부산역 광장 연결됨 · ← → 방향키 또는 아래 버튼으로 이동';$('chat-input').disabled=$('chat-send').disabled=false;$('chat-input').placeholder='광장에 있는 사람들에게 인사해봐';};
        stream.onerror=()=>{$('station-status').textContent='광장 연결이 끊겼어. 다시 연결을 눌러줘.';$('chat-input').disabled=$('chat-send').disabled=true;stream.close();joined=null;players=[];drawPlayers();};
        }
        lastProfile=JSON.stringify(game.publicProfile());drawPlayers();
      }catch(e){$('station-status').textContent=e.message+' · 서버 없이도 내 캐릭터를 움직여볼 수 있어.';drawPlayers();}
      finally{joining=false;}
    }
    function leave(){clearTimeout(pollTimer);pollTimer=null;keys.clear();moving=false;if(stream){stream.close();stream=null;}const current=joined;if(current){post('leave',{id:current.id}).catch(()=>{});}joined=null;players=[];$('chat-input').disabled=$('chat-send').disabled=true;}
    function sync(){if(!joined||!active)return;lastSent=Date.now();post('update',{id:joined.id,x,direction,profile:game.publicProfile()}).catch(()=>{});}
    function setActive(value){active=value;if(value){game.visit('station','plaza');drawPlayers();join();arena.focus({preventScroll:true});}else leave();}
    function frame(time){requestAnimationFrame(frame);const elapsed=Math.min(50,time-(lastFrame||time));lastFrame=time;if(!active)return;const delta=(keys.has('right')?1:0)-(keys.has('left')?1:0),wasMoving=moving;moving=delta!==0;if(delta){direction=delta;x=Math.max(7,Math.min(93,x+delta*elapsed*.025));drawPlayers();if(Date.now()-lastSent>(joined?.polling?250:100))sync();}else if(wasMoving){drawPlayers();sync();}else if(Date.now()-lastSent>5000)sync();}
    requestAnimationFrame(frame);
    document.addEventListener('keydown',event=>{if(!active||document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable)return;const key=event.key==='ArrowLeft'?'left':event.key==='ArrowRight'?'right':null;if(key){event.preventDefault();if(!keys.has(key)){direction=key==='left'?-1:1;x=Math.max(7,Math.min(93,x+direction));drawPlayers();sync();}keys.add(key);}});
    document.addEventListener('keyup',event=>{if(event.key==='ArrowLeft')keys.delete('left');if(event.key==='ArrowRight')keys.delete('right');});
    root.addEventListener('blur',()=>keys.clear());
    for(const dir of ['left','right']){const button=$('station-'+dir);button.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(dir);button.setPointerCapture(e.pointerId);});for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>keys.delete(dir));}
    $('station-connect').onclick=()=>{leave();join();};root.addEventListener('pagehide',leave);
    return {setActive,join,updateProfile(){if(active){drawPlayers();const key=JSON.stringify(game.publicProfile());if(joined&&key!==lastProfile){lastProfile=key;sync();}}},async send(text){if(!joined)throw Error('광장에 먼저 연결해줘.');return post('chat',{id:joined.id,text});}};
  }
  root.BusangiStation={create};
})(window);
