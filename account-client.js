(function(root){
  'use strict';
  const account={user:null,storage:null};let cached=null,revision=0,timer=null,busy=false,dirty=false,conflict=false,mode='login',authenticated=false;
  const $=id=>document.getElementById(id),base=location.protocol==='file:'?'http://127.0.0.1:4173':'';
  const status=text=>{const el=$('account-state');if(el)el.textContent=text;};
  async function request(route,body){
    let r;try{r=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Busangi-Request':'1'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(10000),keepalive:!!body});}
    catch{throw Error('게임 서버에 연결할 수 없어. 서버 시작 파일을 실행해줘.');}
    return BusangiAccountResponse.read(r);
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
    const close=()=>{if(authenticated)location.reload();else $('account-dialog').close();};
    $('account-close').onclick=close;$('account-continue').onclick=()=>location.reload();
    $('account-dialog').addEventListener('cancel',event=>{if(authenticated){event.preventDefault();location.reload();}});
    function choose(next){
      mode=next;
      for(const tab of ['register','login'])$('account-'+tab).setAttribute('aria-pressed',String(tab===mode));
      $('account-import-row').hidden=mode!=='register';
      $('account-submit').textContent=mode==='register'?'가입 완료':'로그인하기';
      $('account-password').autocomplete=mode==='register'?'new-password':'current-password';
      status(mode==='register'?'닉네임과 8자 이상 비밀번호를 입력한 뒤 가입 완료를 눌러줘.':'닉네임과 비밀번호로 이어서 시작해봐.');
    }
    $('account-register').onclick=()=>choose('register');$('account-login').onclick=()=>choose('login');

    $('account-form').addEventListener('submit',async event=>{
      event.preventDefault();if(!$('account-form').reportValidity())return;
      if(!$('account-nickname').value.trim()){status('사용할 닉네임을 입력해줘.');$('account-nickname').focus();return;}
      $('account-register').disabled=$('account-login').disabled=$('account-submit').disabled=true;
      const currentMode=mode;status(currentMode==='register'?'계정을 만들고 있어…':'로그인하고 있어…');
      try{
        const data=await request('/api/auth/'+currentMode,{nickname:$('account-nickname').value,password:$('account-password').value});
        authenticated=true;let imported=true;
        if(currentMode==='register'&&$('account-import').checked&&root.busangiApp){
          try{await request('/api/save',{state:root.busangiApp.state,revision:data.revision});}catch{imported=false;}
        }
        $('account-password').value='';$('account-auth-fields').hidden=true;$('account-continue').hidden=false;
        $('account-title').textContent=currentMode==='register'?'가입 완료!':'로그인 완료!';
        status(imported?data.user.nickname+'님, '+(currentMode==='register'?'부산기 계정이 만들어졌어. 이제 다른 기기에서도 이어 할 수 있어.':'저장된 부산기를 불러올 준비가 됐어.'):'계정은 만들어졌지만 진행 상황을 가져오지 못했어. 기존 브라우저 기록은 그대로 남아 있어.');
        $('account-continue').focus();
      }catch(e){status(e.message);}finally{$('account-register').disabled=$('account-login').disabled=$('account-submit').disabled=false;}
    });
    $('account-logout').onclick=async()=>{try{await flush();if(dirty){status('저장을 마친 후 로그아웃해줘.');return;}await request('/api/auth/logout',{});location.reload();}catch(e){status(e.message);}};
    $('account-save-now').onclick=()=>flush();
    root.addEventListener('pagehide',()=>flush());resolve(account);
  },{once:true}));
  account.flush=flush;root.BusangiAccount=account;
})(window);
