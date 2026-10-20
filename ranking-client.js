(function(root){
 'use strict';let page=1,busy=false;
 const $=id=>document.getElementById(id),number=n=>n.toLocaleString('ko-KR');
 async function load(next=page){
  if(busy)return;busy=true;$('ranking-refresh').disabled=true;$('ranking-prev').disabled=true;$('ranking-next').disabled=true;
  $('ranking-status').textContent='회원들의 성장 기록을 불러오는 중…';
  try{
   if(location.protocol==='file:')throw Error('랭킹은 게임 서버 주소에서 이용해줘.');
   if(root.BusangiAccount.user)await root.BusangiAccount.flush();
   const response=await fetch('/api/ranking?page='+next,{cache:'no-store',signal:AbortSignal.timeout(10000)});
   const data=await response.json();if(!response.ok)throw Error(data.error||'랭킹을 불러오지 못했어. 잠시 후 새로고침해줘.');page=data.page;
   $('ranking-rows').replaceChildren(...data.entries.map(entry=>{
    const row=document.createElement('tr');if(entry.isMe)row.className='ranking-self';
    for(const value of [entry.rank+'위',entry.nickname+(entry.isMe?' (나)':''),entry.jobName+' · '+entry.jobType,number(entry.jobPoints),number(entry.totalAssets)+'원',number(entry.assetPoints),number(entry.totalScore)+'점']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}return row;
   }));
   $('ranking-status').textContent=data.total?'전체 '+number(data.total)+'명 · 조회 '+new Date(data.updatedAt).toLocaleTimeString('ko-KR'):'아직 서버에 저장된 회원 기록이 없어. 가입하고 첫 기록을 남겨봐!';
   $('ranking-me').textContent=data.me?'내 순위 '+data.me.rank+'위 / '+number(data.total)+'명 · '+number(data.me.totalScore)+'점':root.BusangiAccount.user?'첫 서버 저장 후 내 순위가 표시돼. 잠시 후 새로고침해줘.':'로그인하면 내 순위도 함께 확인할 수 있어. 게스트 기록은 랭킹에 포함되지 않아.';
   if(data.valuationAt)$('ranking-status').textContent+=' · 주식 시세 '+new Date(data.valuationAt).toLocaleTimeString('ko-KR')+(data.stale?' (시세 갱신 실패 · 이전 조회값 사용)':' 기준');
   $('ranking-page').textContent=page+' / '+data.pages;$('ranking-prev').disabled=page<=1;$('ranking-next').disabled=page>=data.pages;
  }catch(error){$('ranking-rows').replaceChildren();$('ranking-status').textContent=error.message;$('ranking-me').textContent='서버에 연결한 뒤 다시 확인해줘.';$('ranking-page').textContent='—';}
  finally{busy=false;$('ranking-refresh').disabled=false;}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  $('ranking-refresh').onclick=()=>load();$('ranking-prev').onclick=()=>load(page-1);$('ranking-next').onclick=()=>load(page+1);
 });root.BusangiRanking={load};
})(window);
