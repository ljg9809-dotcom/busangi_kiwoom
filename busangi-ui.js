// 부산기 화면 연결 및 시작 화면 전환. 게임시작 전에는 타이머를 실행하지 않습니다.
// 화면 연결 코드. 데이터/게임 규칙은 busangi-game.js에 유지합니다.
    document.addEventListener('DOMContentLoaded', async () => {
      'use strict';
      const $ = id => document.getElementById(id);
      const notify = text => { $('notice').textContent = text; if (!$('intro-screen').hidden) $('intro-status').textContent = text; };
      if (!window.BusangiGame) { notify('게임 파일을 불러오지 못했습니다. index.html과 busangi-game.js를 같은 폴더에 두세요.'); return; }
      let game;
      await BusangiAccount.ready;
      try { game = BusangiGame.create({storage:BusangiAccount.storage||undefined});if(BusangiAccount.user)game.state.nickname=BusangiAccount.user.nickname; }
      catch (error) { notify('게임을 시작할 수 없습니다: ' + error.message); return; }
      const data = BusangiGame.data, won = BusangiGame.formatMoney;
      let marketConnecting=false,marketMessage='시세 서버 연결 전 · 주식 화면에서 연결해줘.';
      async function connectMarket(){
        if(marketConnecting)return;
        marketConnecting=true;marketMessage='한국투자증권 시세 서버 연결 중…';game.emit();
        try {game.market=await BusangiMarket.connect();marketMessage='한국투자증권 현재가 연결됨 · 조회·주문 시 갱신 · 게임머니 거래';}
        catch(error){game.market=null;marketMessage=error.message;}
        finally{marketConnecting=false;game.emit();}
      }
      function showQuote(q){
        const direction=q.change>0?'↑ 상승':q.change<0?'↓ 하락':'— 보합';
        $('stock-quote').textContent=q.name+' ('+q.code+' · '+q.exchange+') · '+won(q.price)+' · '+direction+' '+Math.abs(q.changePercent||0)+'% · 조회 '+new Date(q.timestamp).toLocaleTimeString('ko-KR');
      }
      const activityNames = {plaza:'광장', meal:'밥 먹기', cafe:'음료 마시기', view:'경치 구경', leisure:'여가생활'};
      const assetNames = {car:'자동차', house:'집', building:'상가·건물', tourism:'관광시설', company:'기업'};
      let state = game.snapshot(), page = 'home', lastResult = JSON.stringify(game.state.lastResult), lastPlace = '', stationSession = null;
      let activeConstruction = false, activeCafe = false,previewClothing=null;
      // 추후 시세·멀티플레이 어댑터를 연결할 때 사용할 진입점.
      window.busangiApp = game;
      const run = async action => { try { return await action(); } catch (error) { notify(error.message); return undefined; } };
      const element = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
      const button = (text, action) => { const el = element('button', text); el.type = 'button'; el.addEventListener('click', () => run(action)); return el; };
      const card = (parent, title, description) => { const el = element('article', '', 'card'); el.append(element('h3', title), element('p', description)); $(parent).append(el); return el; };
      function navigate(target, focus = true) {
        if (!$('page-' + target)) target = 'home'; page = target;
        if(target!=='closet'&&previewClothing){previewClothing=null;game.emit();}
        document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'page-' + target; });
        document.querySelectorAll('.main-nav [data-page]').forEach(el => { if (el.dataset.page === target) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
        history.replaceState(null, '', '#' + target);
        const sceneHost=$('scene-'+target+'-host')||$('scene-home-host');
        sceneHost.append($('scene-panel'));
        stationController.setActive(target==='station');
        if (focus) $('page-' + target).querySelector('h1').focus();
      }
      document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', event => { event.preventDefault(); navigate(el.dataset.page); }));
      data.locations.forEach(place => {
        const el = card('location-list', place.name, place.description);
        const thumbnail=element('img','', 'location-thumb');
        thumbnail.src=BusangiScenes.backgrounds[place.id].default;thumbnail.alt=place.name+' 배경 일러스트';thumbnail.loading='lazy';thumbnail.width=640;thumbnail.height=360;
        el.prepend(thumbnail);
        el.append(button('이곳으로 이동', () => {
          game.visit(place.id); notify(place.name + '에 도착했어!');
          document.querySelector('.scene').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
        }));
      });
      data.items.forEach(item => {
        const el = card(item.activity === 'leisure' ? 'leisure-list' : 'food-list', item.name,
          won(item.price) + ' · ' + (item.stat === 'health' ? '체력' : '정신력') + ' +' + item.recovery);
        const buy = button('구매·이용', () => {
          const recovered = game.consume(item.id); notify(item.name + ' 이용 완료! 실제 회복 +' + recovered);
          document.querySelector('.scene').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
        });
        buy.dataset.item = item.id; el.append(buy);
      });
      data.clothes.forEach(item => {
        const el = card('clothing-list', item.name, won(item.price) + ' · 첫 구매 시 정신력 +' + item.recovery);
        el.dataset.wardrobeItem=item.id;
        const icon=element('div','','clothing-icon');icon.setAttribute('role','img');icon.setAttribute('aria-label',item.name+' 그림');
        icon.style.backgroundImage='url('+JSON.stringify(item.image)+')';icon.style.backgroundPosition=(item.frame%3)*50+'% '+Math.floor(item.frame/3)*50+'%';el.prepend(icon);
        const preview=button('미리 입어보기',()=>{previewClothing=item.id;game.emit();$('scene-closet-host').scrollIntoView({behavior:'smooth',block:'start'});});
        const buy = button('구매하기', () => { previewClothing=null;game.buyClothing(item.id); notify(item.name + ' 구매·착용 완료!'); }); buy.dataset.clothing = item.id;
        const equip = button('착용하기', () => { previewClothing=null;game.equip(item.id); notify(item.name + ' 착용 완료!'); }); equip.dataset.equip = item.id;
        el.append(preview,buy,equip);
      });
      $('closet-preview-reset').addEventListener('click',()=>{previewClothing=null;game.emit();});
      data.jobs.forEach(job => {
        const el = card('job-list', job.name + ' · ' + job.type, '필요 지능 ' + job.intelligence + ' · 1회 급여 ' + won(job.pay) + ' · 체력 −' + job.healthCost + ' / 정신력 −' + job.mentalCost);
        const apply = button('지원하기', () => { game.applyJob(job.id); notify(job.name + ' 입사 완료!'); }); apply.dataset.job = job.id; el.append(apply);
      });
      data.assets.forEach(asset => {
        const share = asset.type === 'car' ? 100 : 1;
        const el = card('asset-list', asset.name, assetNames[asset.type] + ' · 전체 가격 ' + won(asset.price) + ' · 전체 소유 시 시간당 ' + won(asset.price * asset.rate));
        el.dataset.assetType = asset.type;
        const owned = element('p'); owned.dataset.assetOwned = asset.id;
        const buy = button((share === 100 ? '한 대 구매 · ' : '1% 구매 · ') + won(asset.price * share / 100), () => { game.buyAsset(asset.id, share); notify(asset.name + ' 구매 완료!'); }); buy.dataset.assetBuy = asset.id;
        el.append(owned, buy);
      });
      $('asset-filter').addEventListener('change', event => {
        document.querySelectorAll('[data-asset-type]').forEach(el => { el.hidden = event.target.value !== 'all' && el.dataset.assetType !== event.target.value; });
      });
      $('rest-toggle').addEventListener('click', () => run(() => game.rest(!state.rest.running)));
      $('claim-income').addEventListener('click', () => run(() => notify(won(game.claimIncome()) + ' 수령했어!')));
      $('study-start').addEventListener('click', () => run(() => { game.startStudy(); notify('공부 타이머를 시작했어. 집중해보자!'); }));
      $('study-pause').addEventListener('click', () => run(() => { game.pauseStudy(); notify('공부 시간을 저장했어.'); }));
      $('start-shift').addEventListener('click', () => run(() => { game.startShift(); notify('1분 근무를 시작했어. 이 페이지를 열어둬!'); }));
      async function startConstruction() {
        const start = $('start-construction'); start.disabled = true;
        try {
          await constructionScene.ready;
          // 시작 실패 시 기존 결과 화면은 유지한다.
          game.startMinigame('construction'); activeConstruction = true; activeCafe = false; render(game.snapshot());
          $('minigame-area').scrollIntoView({behavior:'instant', block:'start'});
          $('minigame-title').focus();
        } finally { start.disabled = false; }
      }
      $('start-construction').addEventListener('click', () => run(startConstruction));
      $('construction-retry').addEventListener('click', () => run(activeCafe ? cafeController.start : startConstruction));
      $('start-cafe').addEventListener('click', () => run(cafeController.start));
      $('cafe-pause').addEventListener('click', () => run(cafeController.togglePause));
      $('finish-minigame').addEventListener('click', () => run(() => activeCafe ? cafeController.stop() : game.finishMinigame()));
      $('construction-exit').addEventListener('click', () => run(() => {
        if (game.session?.type === 'construction') game.finishMinigame();
        if (game.session?.type === 'cafe') cafeController.stop();
        const cafe = activeCafe; activeConstruction = false; activeCafe = false;
        render(game.snapshot()); $(cafe ? 'start-cafe' : 'start-construction').focus();
      }));
      document.querySelectorAll('[data-stair]').forEach(el => el.addEventListener('click', () => run(() => game.stair(el.dataset.stair))));
      document.querySelectorAll('[data-lane]').forEach(el => {
        el.addEventListener('pointerdown', event => {
          if(event.button!==0)return;
          event.preventDefault(); run(() => cafeController.hit(Number(el.dataset.lane)));
        });
        // 키보드·보조기술로 발생한 클릭도 지원하며 터치와 중복 판정하지 않는다.
        el.addEventListener('click', event => { if(event.detail===0)run(() => cafeController.hit(Number(el.dataset.lane))); });
      });
      document.addEventListener('keydown', event => {
        if (page === 'work' && (activeConstruction || activeCafe) && event.key === 'Tab') {
          const controls = [...$('minigame-area').querySelectorAll('button:not(:disabled)')].filter(el => !el.hidden && el.getClientRects().length);
          const index = controls.indexOf(document.activeElement);
          if (controls.length && (index < 0 || (!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index === 0))) {
            event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus();
          }
          return;
        }
        if (page !== 'work' || !state.minigame || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.repeat) return;
        if (state.minigame.type === 'construction' && ['ArrowUp', ' '].includes(event.key)) { event.preventDefault(); run(() => game.stair(event.key === 'ArrowUp' ? 'up' : 'turn')); }
        const lane = ['d','f','j','k'].indexOf(event.key.toLowerCase());
        if (state.minigame.type === 'cafe' && lane >= 0) { event.preventDefault(); run(() => cafeController.hit(lane)); }
      });
      $('connect-market').addEventListener('click',connectMarket);
      const stockDirectory=BusangiStockDirectory.stocks;
      $('stock-directory-date').textContent='종목명 목록: '+BusangiStockDirectory.source+' · '+BusangiStockDirectory.updatedAt.slice(0,10)+' 기준';
      function stockCode(){const code=BusangiStockSearch.resolve(stockDirectory,$('stock-code').value);if(!code)throw Error('아래 검색 결과에서 종목을 선택해줘.');return code;}
      $('stock-code').addEventListener('input',()=>{
        const matches=BusangiStockSearch.search(stockDirectory,$('stock-code').value);
        $('stock-search-results').replaceChildren(...matches.map(item=>button(item.name+' · '+item.code+' · '+item.exchange,()=>{$('stock-code').value=item.name;$('stock-search-results').replaceChildren();})));
      });
      $('lookup-stock').addEventListener('click',()=>run(async()=>{
        const code=stockCode();
        $('lookup-stock').disabled=true;$('stock-quote').textContent='현재가를 조회하고 있어…';
        try{const q=await game.market.getQuote(code);showQuote(q);}
        catch(error){$('stock-quote').textContent=error.message;throw error;}
        finally{$('lookup-stock').disabled=false;}
      }));
      $('stock-form').addEventListener('submit', event => { event.preventDefault(); run(async () => { const order=await game.trade($('stock-side').value, stockCode(), Number($('stock-quantity').value)); showQuote(game.quotes[order.code]);notify('게임머니 주문 체결 · '+order.quantity+'주 · 1주 '+won(order.price)+' · 수수료 '+won(order.fee)); }); });
      $('refresh-stocks').addEventListener('click', () => run(() => game.refreshPortfolio()));
      $('chat-form').addEventListener('submit', event => { event.preventDefault(); run(async () => { await stationController.send($('chat-input').value); $('chat-input').value = ''; }); });
      function profileRow(label, value) { const row = element('div'); row.append(element('dt', label), element('dd', value)); $('public-profile').append(row); }
      function render(next) {
        state = next;
        $('nickname').textContent = state.nickname;
        const job = data.jobs.find(job => job.id === state.job);
        $('job-label').textContent = job ? job.name : '취업준비생';
        $('cash').textContent = won(state.cash); $('hourly-income').textContent = won(state.hourlyIncome);
        ['health', 'mental', 'intelligence'].forEach(key => { $(key).value = state[key]; $(key + '-value').textContent = state[key] + ' / 100'; });
        $('pending-income').textContent = won(state.income.pending);
        $('rest-toggle').textContent = state.rest.running ? '휴식 끝내기' : '무료 휴식 시작';
        const place = data.locations.find(place => place.id === state.location);
        const scene=BusangiScenes.resolve(state);
        const scenePlace=scene.location==='home'?'우리 집':scene.location==='study-room'?'독서실':scene.venue?place.name+' · '+scene.venue:scene.location==='lotteworld'?'부산 롯데월드':place.name;
        const sceneElement=document.querySelector('.scene'),character=$('scene-character');
        $('scene-place').textContent=scenePlace;$('scene-description').textContent=scene.label;
        sceneElement.dataset.location=scene.location;sceneElement.dataset.activity=scene.activity;sceneElement.dataset.action=scene.action;
        sceneElement.style.setProperty('--actor-x',scene.layout.x+'%');
        sceneElement.style.setProperty('--actor-height',scene.layout.height+'%');
        sceneElement.style.setProperty('--actor-bottom',scene.layout.bottom+'px');
        $('scene-action-label').textContent=scene.label;
        if(character.dataset.action!==scene.action){
          character.dataset.action=scene.action;character.alt=scene.alt;character.src=scene.src;
          character.classList.remove('scene-action-enter');
        }
        const dress=page==='closet'&&previewClothing?BusangiWardrobe.withItem(state.equipped,previewClothing):state.equipped;
        const dressNames=Object.values(dress).map(id=>data.clothes.find(i=>i.id===id)?.name).filter(Boolean).join(', ');
        BusangiWardrobe.apply(character,scene,dress,dressNames);
        $('closet-preview-status').textContent=previewClothing?'미리보기 · '+data.clothes.find(i=>i.id===previewClothing).name+' (구매·재화 사용 없음)':'현재 착용한 옷을 보고 있어.';
        $('closet-preview-reset').hidden=!previewClothing;
        const background=$('scene-background');
        background.style.backgroundPosition=scene.layout.backgroundPosition;
        if(background.dataset.src!==(scene.background||'')){
          background.dataset.src=scene.background||'';
          background.style.backgroundImage=scene.background?'url('+JSON.stringify(scene.background)+')':'none';
        }
        sceneElement.classList.toggle('has-background',!!scene.background);
        $('background-status').hidden=!!scene.background;
        $('background-status').textContent=scenePlace+' · 배경 이미지 준비 중';
        $('current-location').textContent = '현재 장소 · ' + place.name; $('location-description').textContent = place.description;
        if (lastPlace !== place.id) {
          lastPlace = place.id; $('location-activities').replaceChildren();
          place.activities.forEach(activity => $('location-activities').append(button(activityNames[activity], () => {
            game.visit(place.id, activity);
            if (activity === 'plaza') navigate('station');
            else if (activity === 'view') { navigate('home'); notify(place.name + '의 경치를 감상하고 있어.'); }
            else notify(activityNames[activity] + ' 메뉴를 아래에서 골라봐!');
          })));
        }
        document.querySelectorAll('[data-item]').forEach(el => {
          const item = data.items.find(item => item.id === el.dataset.item);
          el.disabled = state.cash < item.price || state[item.stat] === 100 || (item.activity !== 'leisure' && !place.activities.includes(item.activity));
        });
        $('collection-count').textContent = '방문한 장소 ' + state.visited.length + ' / ' + data.locations.length;
        $('collection-list').replaceChildren(...data.locations.filter(place => state.visited.includes(place.id)).map(place => element('li', place.name + ' · ' + place.description)));
        document.querySelectorAll('[data-clothing]').forEach(el => { const item = data.clothes.find(item => item.id === el.dataset.clothing); el.disabled = state.clothes.includes(item.id) || state.cash < item.price; el.textContent = state.clothes.includes(item.id) ? '보유 중' : '구매하기'; });
        document.querySelectorAll('[data-equip]').forEach(el => {const wearing=Object.values(state.equipped).includes(el.dataset.equip);el.disabled=!state.clothes.includes(el.dataset.equip)||wearing;el.textContent=wearing?'착용 중':'착용하기';});
        const outfit = Object.entries(state.equipped).map(([slot, id]) => ({slot, item: data.clothes.find(item => item.id === id)})).filter(entry => entry.item);
        $('outfit-summary').textContent = (previewClothing?'미리보기 의상: ':'현재 의상: ') + (dressNames || '기본 부산기');
        $('equipped-list').replaceChildren(...outfit.map(({slot, item}) => { const li = element('li', item.name + ' '); li.append(button('벗기', () => game.unequip(slot))); return li; }));
        if (!outfit.length) $('equipped-list').append(element('li', '기본 부산기를 착용 중이야.'));
        const seconds = Math.floor(state.study.remainderMs / 1000);
        $('study-clock').textContent = String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
        $('study-progress').value = state.study.remainderMs;
        $('study-total').textContent = '총 공부 시간 ' + Math.floor(state.study.totalMs / 60000) + '분';
        $('study-status').textContent = state.study.running ? '공부 중 · 차근차근 쌓이는 시간' : '일시정지 · 누적 시간은 저장돼';
        $('study-start').disabled = state.study.running; $('study-pause').disabled = !state.study.running;
        document.querySelectorAll('[data-job]').forEach(el => { const job = data.jobs.find(job => job.id === el.dataset.job); el.disabled = state.intelligence < job.intelligence || state.job === job.id; el.textContent = state.job === job.id ? '재직 중' : '지원하기'; });
        $('start-shift').disabled = !state.job || game.busy;
        $('shift-status').textContent = game.shift ? '근무 중 · 남은 시간 ' + Math.max(0, Math.ceil((game.shift.endAt - Date.now()) / 1000)) + '초' : job ? job.name + ' · 1회 급여 ' + won(job.pay) : '먼저 원하는 직장에 지원해줘.';
        document.querySelectorAll('[data-asset-owned]').forEach(el => { el.textContent = '보유 지분 ' + (state.assetShares[el.dataset.assetOwned] || 0) + '%'; });
        document.querySelectorAll('[data-asset-buy]').forEach(el => { const asset = data.assets.find(a => a.id === el.dataset.assetBuy); el.disabled = (state.assetShares[asset.id] || 0) >= 100 || state.cash < asset.price * (asset.type === 'car' ? 1 : 0.01); });
        const portfolio = game.portfolio();
        $('total-assets').textContent = portfolio.total === null ? '주식 시세 확인 필요' : won(portfolio.total); $('owned-value').textContent = won(portfolio.assetValue);
        $('stock-fields').disabled = !state.marketConnected; $('refresh-stocks').disabled = !state.marketConnected;
        $('market-status').textContent = marketMessage;
        $('connect-market').disabled=marketConnecting;
        $('stock-holdings').replaceChildren(...Object.entries(state.stocks).map(([code, holding]) => {const q=game.quotes[code];return element('li', code + ' · ' + holding.name + ' · ' + holding.quantity + '주 · 수수료 포함 매입금액 ' + won(holding.cost)+(q?' · 평가금액 '+won(q.price*holding.quantity)+' · 평가손익 '+won(q.price*holding.quantity-holding.cost):' · 평가금액 조회 필요'));}));
        if (!Object.keys(state.stocks).length) $('stock-holdings').append(element('li', '보유 종목이 없습니다.'));
        $('public-profile').replaceChildren();
        profileRow('닉네임', state.nickname); profileRow('직업', job ? job.name : '취업준비생');
        profileRow('능력치', '체력 ' + state.health + ' · 정신력 ' + state.mental + ' · 지능 ' + state.intelligence);
        profileRow('보유 재화', won(state.cash)); profileRow('총자산', portfolio.total === null ? '주식 시세 확인 필요' : won(portfolio.total));
        profileRow('의상', outfit.map(entry => entry.item.name).join(', ') || '기본 부산기');
        stationController.updateProfile();
        const construction = state.minigame ? state.minigame.type === 'construction' : activeConstruction;
        const constructionDone = activeConstruction && !state.minigame && state.lastResult?.type === 'construction';
        const cafe = state.minigame ? state.minigame.type === 'cafe' : activeCafe;
        const cafeDone = activeCafe && !state.minigame && state.lastResult?.type === 'cafe';
        $('minigame-area').hidden = !state.minigame && !constructionDone && !cafeDone;
        $('minigame-area').classList.toggle('construction-mode', construction);
        $('minigame-area').classList.toggle('cafe-mode', cafe);
        if (construction || cafe) { $('minigame-area').setAttribute('role','dialog'); $('minigame-area').setAttribute('aria-modal','true'); }
        else { $('minigame-area').removeAttribute('role'); $('minigame-area').removeAttribute('aria-modal'); }
        document.body.classList.toggle('construction-open', (construction || cafe) && page === 'work');
        $('construction-exit').hidden = !construction && !cafe;
        $('construction-exit').textContent = cafe ? '카페 나가기' : '현장 나가기';
        $('construction-result').hidden = !constructionDone && !cafeDone;
        $('construction-controls').hidden = !construction;
        $('cafe-controls').hidden = construction || !state.minigame;
        $('finish-minigame').hidden = !state.minigame;
        $('cafe-pause').hidden = !cafe || !state.minigame;
        $('cafe-volume-label').hidden = !cafe;
        $('cafe-pause').textContent = state.minigame?.paused ? '계속하기' : '일시정지';
        document.querySelectorAll('[data-lane]').forEach(el => { el.disabled = !state.minigame || !!state.minigame.paused; });
        $('game-canvas').setAttribute('aria-label',cafe ? '카페 리듬게임: 노트가 하단 판정선에 도착하면 D F J K 레인을 누르세요.' : '안전모와 벽돌 지게를 멘 부산기가 공사장 계단을 오르는 게임');
        document.querySelectorAll('[data-stair]').forEach(el => { el.disabled = !state.minigame; });
        if (constructionDone) {
          $('construction-result-reason').textContent = state.lastResult.reason === 'wrong-step' ? '앗, 발을 헛디뎠어!' : state.lastResult.reason === 'timeout' ? '오늘 근무 시간 끝!' : '수고했어, 부산기!';
          $('construction-result-height').textContent = state.lastResult.height + '계단 도착';
          $('construction-result-earned').textContent = won(state.lastResult.earned) + ' 획득';
          $('game-status').textContent = '다시 도전해서 더 높이 올라가보자.';
        }
        if (cafeDone) {
          const result=state.lastResult;
          $('construction-result-reason').textContent=result.completed?'음악 끝까지 완주했어!':'중간 근무 정산';
          $('construction-result-height').textContent='정확도 '+result.accuracy+'%';
          $('construction-result-earned').textContent=won(result.earned)+' 획득 · 완주 보너스 '+won(result.bonus);
          $('game-status').textContent='최고 콤보 '+result.bestCombo+' · 완성 음료 '+result.drinks+'잔';
        }
        if (state.minigame) {
          $('minigame-title').textContent = construction ? '공사장 · 계단 오르기' : '카페 · 리듬 음료 제조';
        }
        const resultKey = JSON.stringify(state.lastResult);
        if (state.lastResult && resultKey !== lastResult) { lastResult = resultKey; $('work-result').textContent = '근무 완료! ' + won(state.lastResult.earned) + ' 획득'; notify($('work-result').textContent); }
      }
      // 공사장은 원화 캐릭터와 컬러 배경, 카페는 리듬 노트를 그린다.
      $('scene-character').addEventListener('load',()=>{$('scene-character').classList.add('scene-action-enter');});
      $('scene-character').addEventListener('error',()=>{
        const image=$('scene-character');
        if(!image.src.endsWith('/assets/busangi-character.png')){image.src='assets/busangi-character.png';image.alt='기본 부산기 · 행동 이미지를 불러오지 못했습니다.';}
      });
      const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
      const constructionScene = BusangiConstruction.create(canvas);
      const cafeController = BusangiCafeController.create(game, canvas, {
        notify, render, onStart: () => { activeCafe=true; activeConstruction=false; }
      });
      function draw() {
        requestAnimationFrame(draw);
        const session=game.session;
        if(page!=='work'||!ctx)return;
        if(activeConstruction&&(!session||session.type==='construction')) {
          constructionScene.draw(session,state.lastResult,Date.now());
          if(session)$('game-status').textContent=session.height+'계단 · 다음 발판을 보고 올라가봐!';
        } else if(activeCafe) {
          cafeController.draw();
          if(session)$('game-status').textContent=session.paused?'음악과 노트가 일시정지됐어.':'판정선에 도착할 때 D · F · J · K를 눌러봐!';
        }
      }
      // 추후 서버 연결 후 호출: await busangiJoinStation(). 실제 유저만 표시한다.
      const stationController=BusangiStation.create({game,notify});
      window.busangiJoinStation=()=>stationController.join();
      game.subscribe(render);
      connectMarket();
      let started = false;
      $('game-start').addEventListener('click', () => {
        if (started) return;
        started = true;
        $('intro-screen').hidden = true;
        $('game-shell').hidden = false;
        document.body.classList.remove('intro-active');
        document.querySelector('meta[name="theme-color"]').content = '#ffffff';
        game.start();
        navigate(location.hash.slice(1) || 'home');
        draw();
        notify(BusangiAccount.user?'부산 생활을 시작해보자! 진행 상황은 로그인한 계정에 자동 저장돼.':'부산 생활을 시작해보자! 회원가입을 하면 다른 브라우저에서도 이어 할 수 있어.');
      });
      if (game.loadError) notify(game.loadError);
    });
