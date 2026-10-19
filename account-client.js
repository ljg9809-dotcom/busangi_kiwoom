(function(root){
  'use strict';
  const account={user:null,storage:null};let cached=null,revision=0,timer=null,busy=false,dirty=false,conflict=false;
  const $=id=>document.getElementById(id),base=location.protocol==='file:'?'http://127.0.0.1:4173':'';
  const status=text=>{const el=$('account-state');if(el)el.textContent=text;};
  async function request(route,body){
    let r;try{r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Busangi-Request':'1'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(10000),keepalive:!!body});}
    catch{throw Error('게임 서버에 연결할 수 없어. 서버 시작 파일을 실행해줘.');}
    const data=await r.json();if(!r.ok){const e=Error(data.error||'요청에 실패했어.');e.conflict=r.status===409;throw e;}return data;
  }
  async function flush(){
    clearTimeout(timer);timer=null;if(!dirty||busy||!account.user||conflict)return;
    busy=true;dirty=false;const current=cached;
    try{const data=await request('/api/save',{state:JSON.parse(current),revision});revision=data.revision;status(account.user.nickname+' · 계정 저장됨');}
    catch(e){dirty=true;conflict=!!e.conflict;status(e.message+' · 이 브라우저에 임시 보관 중');}
    finally{busy=false;if(dirty&&!conflict)schedule();}
  }
  function schedule(){if(!timer)timer=setTimeout(flush,2000);}
  account.ready=new Promise(resolve=>document.addEventListener('DOMContentLoaded',async()=>{
    try{
      const transfer=new URLSearchParams(location.search).get('transfer');
      if(transfer){const draft=await request('/api/transfer?id='+encodeURIComponent(transfer));localStorage.setItem('busangi-game-v1',JSON.stringify(draft.state));history.replaceState(null,'',location.pathname+'#home');}
      if(location.protocol!=='file:'){
        const session=await request('/api/auth/session');account.user=session.user;
        if(account.user){revision=session.revision;cached=session.state?JSON.stringify(session.state):null;account.storage={getItem:()=>cached,setItem:(_key,value)=>{cached=value;try{localStorage.setItem('busangi-account-backup-'+account.user.id,value);}catch{}dirty=true;schedule();}};status(account.user.nickname+' · 계정 저장 연결');}
        else status('게스트 · 가입하면 다른 브라우저에서도 이어 할 수 있어');
      }else status('계정 저장은 게임 서버에서 이용할 수 있어');
    }catch(e){status(e.message);}
    $('account-open').textContent=account.user?account.user.nickname+' · 계정':'회원가입 / 로그인';
    $('account-auth-fields').hidden=!!account.user;$('account-logout').hidden=!account.user;
    $('account-save-now').hidden=!account.user;
    if(account.user)document.querySelector('footer p:last-child').textContent='진행 상황은 로그인한 계정에 자동 저장됩니다. 다른 브라우저에서도 같은 게임 서버에 로그인해 이어 할 수 있어요.';
    $('account-open').addEventListener('click',async()=>{
      if(location.protocol==='file:'){
        try{const state=root.busangiApp?.state;if(!state){location.href=base+'/#home';return;}status('현재 진행 상황을 가져가고 있어…');const draft=await request('/api/transfer',{state});location.href=base+'/?transfer='+draft.id+'#home';}
        catch(e){status(e.message);$('account-dialog').showModal();}return;
      }
      $('account-dialog').showModal();
    });
    $('account-close').onclick=()=>$('account-dialog').close();
    for(const mode of ['register','login'])$('account-'+mode).onclick=async()=>{
      $('account-register').disabled=$('account-login').disabled=true;
      try{
        const data=await request('/api/auth/'+mode,{nickname:$('account-nickname').value,password:$('account-password').value});
        if(mode==='register'&&$('account-import').checked&&root.busangiApp)await request('/api/save',{state:root.busangiApp.state,revision:data.revision});
        $('account-password').value='';location.reload();
      }catch(e){status(e.message);}finally{$('account-register').disabled=$('account-login').disabled=false;}
    };
    $('account-logout').onclick=async()=>{try{await flush();if(dirty){status('저장을 마친 후 로그아웃해줘.');return;}await request('/api/auth/logout',{});location.reload();}catch(e){status(e.message);}};
    $('account-save-now').onclick=()=>flush();
    root.addEventListener('pagehide',()=>flush());resolve(account);
  },{once:true}));
  account.flush=flush;root.BusangiAccount=account;
})(window);
