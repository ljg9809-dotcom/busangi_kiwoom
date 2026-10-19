/* 음악 파형에서 노트를 생성하고 실제 audio.currentTime에 맞춰 그리는 카페 무대. */
(function(root){
  'use strict';
  async function analyze(bytes){
    const Decoder=root.OfflineAudioContext||root.webkitOfflineAudioContext;
    if(!Decoder)throw new Error('이 브라우저에서 음원 분석을 지원하지 않습니다.');
    const buffer=await new Decoder(1,1,44100).decodeAudioData(bytes.slice(0));
    if(buffer.duration>7200||buffer.duration<3)throw new Error('3초~2시간 사이 음원을 선택해주세요.');
    const channel=buffer.getChannelData(0),hop=Math.round(buffer.sampleRate*.02),windowSize=hop*2;
    const energy=[];
    for(let i=0;i<channel.length-windowSize;i+=hop){
      let value=0;for(let j=0;j<windowSize;j+=4)value+=channel[i+j]*channel[i+j];
      energy.push(Math.sqrt(value/(windowSize/4)));
    }
    const flux=energy.map((e,i)=>Math.max(0,e-(energy[Math.max(0,i-2)]||0)));
    const notes=[];let last=-1,lane=0;
    for(let i=100;i<flux.length-25;i++){
      const neighborhood=flux.slice(Math.max(0,i-25),i+26).sort((a,b)=>a-b);
      const threshold=Math.max(.0007,neighborhood[Math.floor(neighborhood.length*.68)]*1.4);
      if(flux[i]>threshold&&flux[i]>=flux[i-1]&&flux[i]>flux[i+1]&&i*.02-last>=.32){
        lane=(lane+1+(Math.round(energy[i]*1000)%3))%4;
        notes.push({at:Math.round(i*hop/buffer.sampleRate*1000),lane});last=i*.02;
      }
    }
    if(notes.length<3)throw new Error('박자를 찾기 어렵습니다. 다른 음원을 선택해주세요.');
    return {durationMs:Math.round(buffer.duration*1000),notes,chartType:'음량 변화 기반 자동 채보'};
  }
  function create(canvas){
    const ctx=canvas.getContext('2d'),barista=new Image();barista.src='assets/busangi-character.png';
    const keys=['D','F','J','K'];
    const point=(lane,y)=>{
      const p=(y-145)/405,half=65+155*p;
      return 240-half+lane*(half*2/4);
    };
    function draw(s,result,now){
      if(!s||!ctx)return;
      if(canvas.width!==480)canvas.width=480;if(canvas.height!==640)canvas.height=640;
      // 컬러 카페 배경, 흑백 게임 UI.
      ctx.fillStyle='#d5b997';ctx.fillRect(0,0,480,640);
      ctx.fillStyle='#31534f';ctx.fillRect(0,0,480,185);
      ctx.fillStyle='#b4d9db';ctx.fillRect(22,85,105,130);ctx.fillRect(350,85,105,130);
      ctx.strokeStyle='#e4d3b8';ctx.lineWidth=6;ctx.strokeRect(22,85,105,130);ctx.strokeRect(350,85,105,130);
      ctx.fillStyle='#795442';ctx.fillRect(0,205,480,28);
      if(barista.complete&&barista.naturalWidth)ctx.drawImage(barista,375,110,82,123);
      ctx.fillStyle='#1b1b1b';ctx.beginPath();ctx.moveTo(175,145);ctx.lineTo(305,145);ctx.lineTo(460,550);ctx.lineTo(20,550);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#888';ctx.lineWidth=2;
      for(let i=0;i<=4;i++){ctx.beginPath();ctx.moveTo(point(i,145),145);ctx.lineTo(point(i,550),550);ctx.stroke();}
      ctx.fillStyle='rgba(255,255,255,.025)';
      for(let i=0;i<4;i+=2){ctx.beginPath();ctx.moveTo(point(i,145),145);ctx.lineTo(point(i+1,145),145);ctx.lineTo(point(i+1,550),550);ctx.lineTo(point(i,550),550);ctx.closePath();ctx.fill();}
      const time=s.playbackMs;
      for(const note of s.notes){
        const delta=note.at-time;if(note.judged||delta>2200||delta< -250)continue;
        const p=Math.max(0,1-delta/2200),y=145+405*p*p;
        const left=point(note.lane,y)+3,width=point(note.lane+1,y)-left-6;
        ctx.fillStyle='#fff';ctx.fillRect(left,y-5,width,10);ctx.fillStyle='#777';ctx.fillRect(left+3,y+5,width-6,3);
      }
      ctx.fillStyle='#fff';ctx.fillRect(20,547,440,5);
      for(let lane=0;lane<4;lane++){
        const active=s.feedback&&s.feedback.lane===lane&&time-s.feedback.at<130&&s.feedback.text!=='MISS';
        ctx.fillStyle=active?'#fff':'#292929';ctx.fillRect(22+lane*110,563,106,56);
        ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(22+lane*110,563,106,56);
        ctx.fillStyle=active?'#111':'#fff';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText(keys[lane],75+lane*110,599);
      }
      ctx.fillStyle='#111';ctx.fillRect(14,14,452,64);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.font='12px sans-serif';
      ctx.fillText(s.trackTitle.slice(0,25),26,37);ctx.font='bold 22px sans-serif';ctx.fillText(s.score.toLocaleString('ko-KR')+'점',26,65);
      ctx.textAlign='right';ctx.font='12px sans-serif';const remaining=Math.max(0,Math.ceil((s.durationMs-time)/1000));ctx.fillText(Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0'),452,37);
      const accuracy=s.hits+s.misses?Math.round((s.perfect+(s.hits-s.perfect)*.6)/(s.hits+s.misses)*100):100;
      ctx.fillText('정확도 '+accuracy+'%',452,62);
      ctx.fillStyle='#ddd';ctx.fillRect(14,82,452,4);ctx.fillStyle='#111';ctx.fillRect(14,82,452*Math.min(1,time/s.durationMs),4);
      ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 34px sans-serif';ctx.fillText(s.combo+' COMBO',240,315);
      if(s.feedback&&time-s.feedback.at<450){ctx.font='bold 25px sans-serif';ctx.fillText(s.feedback.text,240,360);}
      const drinks=Math.floor(s.hits/4);ctx.font='12px sans-serif';ctx.fillText('완성 음료 '+drinks+'잔 · 완주 보너스 +10,000원',240,521);
      if(s.paused){ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(0,90,480,550);ctx.fillStyle='#fff';ctx.font='bold 28px sans-serif';ctx.fillText('잠깐 쉬는 중',240,340);}
      ctx.textAlign='left';
    }
    return {draw};
  }
  root.BusangiCafe={analyze,create};
})(window);
