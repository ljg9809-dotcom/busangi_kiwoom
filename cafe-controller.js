/* 실제 음원 재생/정지/종료와 게임을 연결한다. 브라우저 시간은 판정에 사용하지 않음. */
(function(root){
  'use strict';
  root.BusangiCafeController={create(game,canvas,options){
    const audio=document.getElementById('cafe-audio'),status=document.getElementById('cafe-track-status');
    const scene=BusangiCafe.create(canvas);
    let chart=BusangiCafeTrack, title=chart.title, objectUrl=null, starting=false,lastSession=null;
    const durationText=ms=>Math.floor(ms/60000)+'분 '+Math.floor(ms/1000%60)+'초';
    function describe(){status.textContent=title+' · '+durationText(chart.durationMs)+' · '+chart.notes.length+'개 노트 · 자동 채보';}
    function ready(){
      if(audio.readyState>=1&&Number.isFinite(audio.duration))return Promise.resolve();
      return new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>done(new Error('음원을 불러오지 못했습니다. 파일을 다시 선택해주세요.')),15000);
        const loaded=()=>done(),error=()=>done(new Error('지원하지 않거나 읽을 수 없는 음원입니다.'));
        function done(err){clearTimeout(timeout);audio.removeEventListener('loadedmetadata',loaded);audio.removeEventListener('error',error);err?reject(err):resolve();}
        audio.addEventListener('loadedmetadata',loaded);audio.addEventListener('error',error);audio.load();
      });
    }
    async function start(){
      if(starting) return;
      if(game.busy)throw new Error('진행 중인 근무를 먼저 마쳐주세요.');
      if(game.state.study.running||game.state.rest.running)throw new Error('공부·휴식을 먼저 마쳐주세요.');
      if(game.state.health<15||game.state.mental<20)throw new Error('체력 또는 정신력을 회복해주세요.');
      starting=true;
      try{
        await ready();audio.pause();audio.currentTime=0;audio.playbackRate=1;audio.loop=false;
        // 재생 권한·코덱 오류 시 재화를 차감하거나 게임을 시작하지 않는다.
        await audio.play();
        try{game.startMinigame('cafe',{title,durationMs:audio.duration*1000,notes:chart.notes.filter(n=>n.at<audio.duration*1000)});}
        catch(error){audio.pause();throw error;}
        lastSession=game.session;options.onStart();options.render(game.snapshot());
        document.getElementById('minigame-title').focus();
      }finally{starting=false;}
    }
    function sync(){
      if(game.session?.type!=='cafe')return;
      game.syncCafe(audio.currentTime*1000);lastSession=game.session;
    }
    function hit(lane){
      if(game.session?.type!=='cafe')return;
      sync();return game.hitNote(lane);
    }
    async function togglePause(){
      if(game.session?.type!=='cafe')return;
      if(!audio.paused){sync();audio.pause();game.pauseCafe(true);}
      else{await audio.play();game.pauseCafe(false);}
      options.render(game.snapshot());
    }
    function stop(reason='manual'){
      if(game.session?.type!=='cafe')return;
      sync();audio.pause();game.finishMinigame(reason);
    }
    audio.addEventListener('ended',()=>{
      if(game.session?.type!=='cafe')return;
      game.pauseCafe(false);game.syncCafe(audio.duration*1000);stop('completed');
    });
    audio.addEventListener('waiting',()=>{if(game.session?.type==='cafe')game.pauseCafe(true);});
    audio.addEventListener('playing',()=>{if(game.session?.type==='cafe'&&game.session.paused)game.pauseCafe(false);});
    audio.addEventListener('error',()=>{
      if(game.session?.type==='cafe'){audio.pause();game.pauseCafe(true);options.notify('음원 재생 오류입니다. 중간 정산 후 다시 시작해주세요.');}
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden&&game.session?.type==='cafe'&&!audio.paused){sync();audio.pause();game.pauseCafe(true);}
    });
    document.getElementById('cafe-file').addEventListener('change',async event=>{
      try{
        if(game.busy)throw new Error('근무를 마친 후 음원을 바꿔주세요.');
        const file=event.target.files[0];if(!file)return;
        if(file.size>150*1024*1024)throw new Error('150MB 이하 음원을 선택해주세요.');
        status.textContent='음악 파형 분석 중…';
        const next=await BusangiCafe.analyze(await file.arrayBuffer());
        audio.pause();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);
        chart=next;title=file.name;audio.src=objectUrl;audio.load();describe();
        document.getElementById('default-music-credit').hidden=true;
      }catch(error){describe();options.notify(error.message);}
    });
    document.getElementById('cafe-default-track').addEventListener('click',()=>{
      if(game.busy){options.notify('근무를 마친 후 음원을 바꿔주세요.');return;}
      audio.pause();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;
      chart=BusangiCafeTrack;title=chart.title;audio.src='assets/verdi-dies-irae.ogg';audio.load();describe();
      document.getElementById('cafe-file').value='';document.getElementById('default-music-credit').hidden=false;
    });
    document.getElementById('cafe-volume').addEventListener('input',event=>{audio.volume=Number(event.target.value)/100;});
    audio.volume=.6;describe();
    function draw(){
      sync();const s=game.session?.type==='cafe'?game.session:lastSession;
      scene.draw(s,game.state.lastResult,performance.now());
    }
    return {start,hit,togglePause,stop,draw};
  }};
})(window);
