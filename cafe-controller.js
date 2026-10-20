/* 주문표를 보고 재료를 선택하는 카페 아르바이트. */
(function(root){
  'use strict';
  root.BusangiCafeController={create(game,canvas,options){
    const $=id=>document.getElementById(id),names=['얼음','커피','우유','바닐라'];
    let lastRecipe='',lastFeedback='';
    function start(){
      if(game.busy)throw new Error('진행 중인 근무를 먼저 마쳐주세요.');
      if(game.state.study.running||game.state.rest.running)throw new Error('공부·휴식을 먼저 마쳐주세요.');
      game.startMinigame('cafe');options.onStart();options.render(game.snapshot());draw();
      $('minigame-area').scrollTop=0;$('minigame-title').focus({preventScroll:true});
    }
    function draw(){
      const s=game.session;if(s?.type!=='cafe')return;
      $('cafe-time').textContent=Math.ceil(s.remainingMs/1000)+'초';
      $('cafe-count').textContent=s.drinks+'잔';$('cafe-combo').textContent=s.combo;
      $('cafe-order-name').textContent=s.order.name;
      const key=s.order.name+':'+s.progress;
      if(key!==lastRecipe){
        lastRecipe=key;$('cafe-recipe').replaceChildren(...s.order.ingredients.map((id,index)=>{
          const li=document.createElement('li');li.textContent=(index<s.progress?'✓ ':String(id+1)+' · ')+names[id];
          li.className=index<s.progress?'done':index===s.progress?'next':'';
          if(index===s.progress)li.setAttribute('aria-current','step');return li;
        }));
      }
      const feedback=s.paused?'잠깐 쉬는 중. 계속하기를 누르면 이어져!':s.feedback;
      if(feedback!==lastFeedback){lastFeedback=feedback;$('cafe-feedback').textContent=feedback;}
    }
    function hit(id){const result=game.addCafeIngredient(id);draw();
      if(result==='SERVED'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)
        $('cafe-scene').animate([{transform:'translateY(0)'},{transform:'translateY(-5px)'},{transform:'translateY(0)'}],{duration:280});
      return result;
    }
    function togglePause(){if(game.session?.type==='cafe'){game.pauseCafe(!game.session.paused);draw();}}
    function stop(){if(game.session?.type==='cafe')game.finishMinigame();}
    const pause=()=>{if(game.session?.type==='cafe'&&!game.session.paused){game.pauseCafe(true);draw();}};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
    window.addEventListener('hashchange',()=>{if(location.hash!=='#work')pause();});
    return {start,hit,togglePause,stop,draw};
  }};
})(window);
