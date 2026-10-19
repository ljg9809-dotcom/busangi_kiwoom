/* 공사장 화면. 게임 판정은 busangi-game.js의 stairs 경로만 사용한다. */
(function (root) {
  'use strict';
  const load = source => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('공사장 이미지를 불러오지 못했습니다: ' + source)); image.src = source;
  });
  root.BusangiConstruction = {
    create(canvas) {
      const ctx = canvas.getContext('2d');
      let background, worker, run = null, last = null, motion = null;
      let cameraX = 0, cameraY = 0, seenHeight = 0, endedAt = null;
      const reduced = root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const ready = Promise.all([load('assets/construction-background.png'), load('assets/busangi-worker.png')])
        .then(images => { [background, worker] = images; });
      // 이미지 로딩 실패는 시작 버튼을 눌렀을 때 안내한다.
      ready.catch(() => {});
      const ease = p => 1 - Math.pow(1 - p, 3);
      function tile(x, y, next, current) {
        ctx.lineWidth = next ? 3 : 2;
        ctx.fillStyle = current ? '#252525' : '#f3eee2'; ctx.strokeStyle = '#282723';
        ctx.beginPath(); ctx.moveTo(x - 35,y); ctx.lineTo(x + 29,y); ctx.lineTo(x + 35,y + 7); ctx.lineTo(x - 29,y + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = current ? '#353535' : '#b6b0a5'; ctx.fillRect(x - 29,y + 7,64,15); ctx.strokeRect(x - 29,y + 7,64,15);
        ctx.fillStyle = current ? '#eee' : '#6c6963';
        for (let i = 0; i < 4; i++) ctx.fillRect(x - 21 + i * 15,y + 12,3,3);
        if (next) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(x - 39,y - 6,79,32);
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 6,y - 18); ctx.lineTo(x + 6,y - 18); ctx.lineTo(x,y - 10); ctx.fill();
        }
      }
      function backdrop(height) {
        ctx.fillStyle = '#d8d3c7'; ctx.fillRect(0,0,480,640);
        if (background) {
          const scale = Math.max(480 / background.width, 640 / background.height);
          const w = background.width * scale, h = background.height * scale;
          const offset = (height * 7) % h;
          // 계단보다 느리게 움직이는 배경으로 높이 상승을 표현.
          ctx.drawImage(background, (480-w)/2, offset, w,h);
          ctx.drawImage(background, (480-w)/2, offset-h, w,h);
        }
        const shade = ctx.createLinearGradient(0,0,0,640); shade.addColorStop(0,'rgba(0,0,0,.15)'); shade.addColorStop(.5,'rgba(0,0,0,0)'); shade.addColorStop(1,'rgba(0,0,0,.18)'); ctx.fillStyle=shade; ctx.fillRect(0,0,480,640);
      }
      function hud(session, now) {
        const left = Math.max(0,(session.endAt-now)/1000);
        ctx.fillStyle = 'rgba(17,17,17,.9)'; ctx.fillRect(16,16,448,74);
        ctx.fillStyle = '#cfcfcf'; ctx.font = '11px "Malgun Gothic", sans-serif';
        ctx.fillText('올라간 계단',30,38); ctx.fillText('이번 근무 수입',174,38); ctx.fillText('남은 시간',354,38);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 23px "Malgun Gothic", sans-serif';
        ctx.fillText(session.height + '층',30,72); ctx.fillText((3000+session.score).toLocaleString('ko-KR')+'원',174,72); ctx.fillText(left.toFixed(1)+'초',354,72);
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(16,96,448,5);
        ctx.fillStyle = '#fff'; ctx.fillRect(16,96,448*Math.min(1,left/20),5);
      }
      function draw(session, result, now) {
        if (!ctx || !background || !worker) return;
        if (canvas.width !== 480) canvas.width = 480;
        if (canvas.height !== 640) canvas.height = 640;
        if (session && session.startedAt !== run) {
          run = session.startedAt; last = session; cameraX=0; cameraY=0; seenHeight=0; motion=null; endedAt=null;
        }
        if (session) {
          if (session.height !== seenHeight) {
            const from = session.stairs[Math.max(0,session.height-1)], to = session.stairs[session.height];
            motion = {from,to,start:now}; seenHeight=session.height;
          }
          last=session;
        } else if (last && endedAt === null) endedAt=now;
        if (!last) return;
        const target=last.stairs[last.height];
        const p=motion ? Math.min(1,(now-motion.start)/150) : 1;
        const t=reduced ? 1 : ease(p);
        const x=motion ? motion.from.x+(motion.to.x-motion.from.x)*t : target.x;
        const y=motion ? motion.from.y+(motion.to.y-motion.from.y)*t : target.y;
        cameraX += (target.x-cameraX)*(reduced ? 1 : .16);
        cameraY += (target.y-cameraY)*(reduced ? 1 : .12);
        backdrop(cameraY);
        for (let i=Math.max(0,last.height-6);i<Math.min(last.stairs.length,last.height+9);i++) {
          const step=last.stairs[i];
          tile(240+(step.x-cameraX)*68,480-(step.y-cameraY)*51,i===last.height+1,i===last.height);
        }
        const hop=reduced ? 0 : Math.sin(p*Math.PI)*16;
        const fall=!session && result && result.reason==='wrong-step' && !reduced ? Math.min(230,Math.pow((now-endedAt)/500,2)*180) : 0;
        const px=240+(x-cameraX)*68, py=480-(y-cameraY)*51-hop+fall;
        ctx.fillStyle='rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(px,py+1,22,5,0,0,Math.PI*2);ctx.fill();
        const h=128,w=h*worker.width/worker.height;
        ctx.save(); ctx.translate(px,py); if(last.direction==='left')ctx.scale(-1,1);
        if(fall)ctx.rotate(Math.min(.8,(now-endedAt)/700));
        ctx.drawImage(worker,-w/2,-h,w,h); ctx.restore();
        if(session && motion && now-motion.start<450) {
          const age=(now-motion.start)/450; ctx.globalAlpha=1-age;ctx.fillStyle='#fff';ctx.font='bold 19px sans-serif';ctx.fillText('+500',px+35,py-100-age*30);ctx.globalAlpha=1;
        }
        if(!session){ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,0,480,640);}
        hud(last,session?now:Math.min(now,last.endAt));
      }
      return {ready,draw};
    }
  };
})(window);
