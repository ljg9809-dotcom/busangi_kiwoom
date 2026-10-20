/**
 * 부산기 키우기 — JavaScript 초안 v0.1
 * 사용: <script src="busangi-game.js"></script>
 * const game = BusangiGame.create(); game.start();
 * game.subscribe(state => { ...화면 그리기... });
 * Node: const BusangiGame = require('./busangi-game.js');
 *
 * 이 파일은 게임 데이터와 동작을 담당한다. HTML/CSS와 배경 원화는 별도 제작.
 * 로컬 저장은 시제품 전용이다. 실제 서비스의 재화·타이머·매매·채팅은
 * 인증된 서버에서 검증해야 한다. 실제 시세나 다른 유저를 임의 생성하지 않는다.
 * 가격·보상은 기획 초기값이며 현실의 수익률 또는 채용 조건이 아니다.
 */
(function (root) {
  'use strict';
  const MINUTE = 60000, HOUR = 60 * MINUTE, WEEK = 7 * 24 * HOUR;
  const STORAGE_KEY = 'busangi-game-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = value => Math.max(0, Math.min(100, value));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const integer = (n, minimum = 1) => Number.isSafeInteger(n) && n >= minimum;
  const money = n => new Intl.NumberFormat('ko-KR').format(Math.floor(n)) + '원';

  const LOCATIONS = [
    ['station', '부산역 광장', '부산 여행과 만남의 출발점', ['plaza']],
    ['gwangalli', '광안리', '광안대교와 바다를 만나는 해변', ['meal', 'cafe', 'view']],
    ['haeundae', '해운대', '해변과 도시 풍경이 함께 있는 곳', ['meal', 'cafe', 'view']],
    ['gamcheon', '감천문화마을', '색색의 집과 골목을 걸어보는 마을', ['cafe', 'view']],
    ['songdo', '송도', '바다 위 케이블카를 바라보는 해변', ['meal', 'cafe', 'view']],
    ['huinnyeoul', '흰여울문화마을', '영도의 바다를 따라 이어지는 골목', ['cafe', 'view']],
    ['nampo', '남포동·자갈치', '시장과 항구에서 만나는 부산', ['meal', 'cafe', 'view']],
    ['dadaepo', '다대포', '넓은 백사장과 노을을 만나는 해변', ['cafe', 'view']],
    ['lotteworld', '부산 롯데월드', '짜릿한 놀이기구와 함께하는 하루', ['view', 'leisure']]
  ].map(([id, name, description, activities]) => ({
    id, name, description, activities,
    // 이미지가 없는 상태. 사용자 원화 기반의 컬러 일러스트가 완성되면 경로 지정.
    backgrounds: Object.fromEntries(activities.map(activity => [activity, null]))
  }));
  const ITEMS = [
    ['hotteok', '씨앗호떡', 2000, 'health', 8, 'meal'],
    ['eomuk', '어묵', 3000, 'health', 12, 'meal'],
    ['milmyeon', '밀면', 8000, 'health', 35, 'meal'],
    ['gukbap', '돼지국밥', 10000, 'health', 50, 'meal'],
    ['sashimi', '회 정식', 30000, 'health', 100, 'meal'],
    ['americano', '아메리카노', 2000, 'health', 8, 'cafe'],
    ['latte', '카페라떼', 3000, 'health', 12, 'cafe'],
    ['juice', '과일주스', 4000, 'health', 16, 'cafe'],
    ['pc', 'PC방 1시간 이용', 2000, 'mental', 10, 'leisure'],
    ['coin-song', '코인노래방 3곡', 3000, 'mental', 15, 'leisure'],
    ['karaoke', '노래방 1시간 이용', 10000, 'mental', 45, 'leisure'],
    ['movie', '영화 보기', 15000, 'mental', 60, 'leisure'],
    ['park', '놀이공원 가기', 47000, 'mental', 100, 'leisure']
  ].map(([id, name, price, stat, recovery, activity]) => ({id, name, price, stat, recovery, activity}));
  const CLOTHES = [
    ['shirt', '부산기 검정 티', 15000, 20, 'top', '#171717'],
    ['white-shirt', '부산기 흰 티', 15000, 20, 'top', '#ffffff'],
    ['sweatshirt', '부산기 퍼플 맨투맨', 30000, 30, 'top', '#7136a5'],
    ['hoodie', '부산기 퍼플 후드', 30000, 35, 'top', '#7136a5'],
    ['jacket', '라벤더 재킷', 70000, 50, 'outer', '#a38bc3'],
    ['busan-set', '부산 테마 의상 세트', 100000, 60, 'set', '#397fc2'],
    ['cap', '모자', 15000, 20, 'hat', '#3c83c4'],
    ['pants', '바지', 30000, 30, 'bottom', '#527cba'],
    ['sneakers', '민트 운동화', 40000, 40, 'shoes', '#5aab86']
  ].map(([id, name, price, recovery, slot, color], frame) => ({id, name, price, recovery, slot, color, image:'assets/wardrobe/catalog.png',frame}));
  const JOBS = [
    ['dongbaek', '동백식품', '중소기업', 10, 30000, 15, 15],
    ['badaro', '바다로물류', '중소기업', 10, 32000, 20, 12],
    ['planning', '부산기획', '중소기업', 10, 30000, 12, 20],
    ['haeon', '해온유통', '중견기업', 30, 55000, 15, 18],
    ['centum', '센텀테크', '중견기업', 30, 60000, 12, 22],
    ['shipping', '동백해운', '중견기업', 30, 58000, 18, 16],
    ['city', '부산기시청', '공무원', 50, 65000, 10, 10],
    ['district', '부산기 구청', '공무원', 50, 65000, 10, 10],
    ['samsong', '삼송전자', '대기업', 60, 100000, 18, 28],
    ['hyundong', '현동자동차', '대기업', 60, 100000, 22, 24],
    ['lotdi', '롯디쇼핑', '대기업', 60, 95000, 20, 25],
    ['metro', '부산기교통공사', '공기업', 70, 85000, 12, 12],
    ['port', '부산기항만공사', '공기업', 70, 90000, 14, 12],
    ['ocean', '한국바다진흥공사', '공기업', 70, 90000, 12, 14]
  ].map(([id, name, type, intelligence, pay, healthCost, mentalCost]) => ({
    id, name, type, intelligence, pay, healthCost, mentalCost,
    duration: MINUTE // 시제품의 1회 근무 시간·급여. 실제 시급이 아니다.
  }));
  const RATES = {car: 0.001, house: 0.002, building: 0.003, tourism: 0.003, company: 0.004};
  const ASSETS = [
    ['used-car', '중고 경차', 'car', 8000000], ['new-car', '신형 경차', 'car', 17000000],
    ['sedan', '준중형 세단', 'car', 25000000], ['ev', '소형 전기차', 'car', 30000000],
    ['suv', '중형 SUV', 'car', 40000000], ['luxury', '고급 세단', 'car', 80000000],
    ['sports', '스포츠카', 'car', 200000000],
    ['saha', '사하구 소형 빌라', 'house', 100000000], ['yeongdo', '영도구 아파트', 'house', 250000000],
    ['buk', '북구 아파트', 'house', 350000000], ['busanjin', '부산진구 아파트', 'house', 450000000],
    ['dongnae', '동래구 아파트', 'house', 600000000], ['haeundae-home', '해운대구 아파트', 'house', 650000000],
    ['suyeong', '수영구 아파트', 'house', 800000000], ['ocean-home', '해운대 바다 전망 고급 주택', 'house', 3000000000],
    ['saha-shop', '사하구 동네 상가 1개 호실', 'building', 300000000],
    ['university-shop', '부산대 앞 상가 1개 호실', 'building', 500000000],
    ['jeonpo', '전포동 소형 상가 건물', 'building', 2000000000],
    ['nampo-building', '남포동 상업 건물', 'building', 4000000000],
    ['gwangalli-building', '광안리 해변 상가 건물', 'building', 8000000000],
    ['seomyeon', '서면 중심가 빌딩', 'building', 15000000000],
    ['haeundae-building', '해운대 대형 상업 빌딩', 'building', 40000000000],
    ['tower', '부산기 전망타워', 'tourism', 20000000000],
    ['cable', '송도 바다케이블카', 'tourism', 70000000000],
    ['train', '해운대 바다열차', 'tourism', 100000000000],
    ['adventure', '부산기 어드벤처', 'tourism', 500000000000],
    ['planning-co', '부산기획', 'company', 1000000000], ['food-co', '동백식품', 'company', 5000000000],
    ['logistics-co', '바다로물류', 'company', 10000000000], ['retail-co', '해온유통', 'company', 50000000000],
    ['tech-co', '센텀테크', 'company', 200000000000], ['shipping-co', '동백해운', 'company', 500000000000],
    ['lotdi-co', '롯디쇼핑', 'company', 2400000000000],
    ['hyundong-co', '현동자동차', 'company', 63000000000000],
    ['samsong-co', '삼송전자', 'company', 1260000000000000]
  ].map(([id, name, type, price]) => ({id, name, type, price, rate: RATES[type]}));
  const THEME = {
    ui: {background: '#ffffff', text: '#111111', border: '#111111', muted: '#eeeeee'},
    character: {monochrome: true, reference: '../부산기_인사하기_v2.png'},
    scenery: {color: true, style: '기존 부산기 원화의 선·형태·질감을 따른 일러스트', usePhotos: false},
    clothing: {color: true},
    accessibility: {stockDirection: '숫자·상승/하락 문구·화살표', statBars: '숫자·패턴'}
  };
  const DATA = {locations: LOCATIONS, items: ITEMS, clothes: CLOTHES, jobs: JOBS, assets: ASSETS, theme: THEME};
  const find = (list, id) => { const entry = list.find(item => item.id === id); assert(entry, '항목을 찾을 수 없습니다: ' + id); return entry; };

  class Game {
    constructor(options = {}) {
      this.now = options.now || Date.now;
      this.random = options.random || Math.random;
      this.storage = options.storage === undefined ? root.localStorage : options.storage;
      this.market = options.market || null;
      this.station = options.station || null;
      this.listeners = new Set(); this.quotes = {}; this.busy = false; this.timer = null;
      this.stockBusy = false; this.session = null; this.loadError = null;
      const time = this.now();
      this.state = {
        version: 1, nickname: '부산기', cash: 30000, health: 100, mental: 100, intelligence: 0,
        location: 'station', activity: 'plaza', visited: ['station'], job: null,
        clothes: [], equipped: {}, assetShares: {}, stocks: {}, trades: [],
        study: {running: false, totalMs: 0, remainderMs: 0, lastTick: time, lastActivity: time, decayWeeks: 0, rateVersion:2},
        income: {lastTick: time, pending: 0, accruedMs: 0}, rest: {running: false, lastTick: time},
        lastResult: null
      };
      if (options.load !== false && this.storage) {
        try {
          const raw = this.storage.getItem(STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            this.validateSave(saved);
            this.state = saved;
            if(this.state.study.rateVersion!==2){
              this.state.intelligence=clamp(this.state.intelligence+Math.floor(this.state.study.remainderMs/MINUTE));
              this.state.study.remainderMs%=MINUTE;this.state.study.rateVersion=2;
            }
            // 마지막 저장 이후 닫혀 있던 시간은 공부로 인정하지 않는다.
            this.state.study.running = false;
            this.state.study.lastTick = time;
            this.state.rest.running = false;
          }
        } catch (error) { this.loadError = '저장 데이터를 불러오지 못했습니다: ' + error.message; }
      }
      this.tick();
    }
    validateSave(s) {
      assert(s && s.version === 1 && integer(s.cash, 0), '저장 형식 오류');
      for (const stat of ['health', 'mental', 'intelligence']) assert(integer(s[stat], 0) && s[stat] <= 100, '능력치 오류');
      find(LOCATIONS, s.location); if (s.job) find(JOBS, s.job);
      assert(Array.isArray(s.visited) && Array.isArray(s.clothes) && Array.isArray(s.trades), '목록 오류');
      for (const id of s.clothes) find(CLOTHES, id);
      assert(s.equipped && s.assetShares && s.stocks && s.study && s.income && s.rest, '저장 필드 누락');
      for(const [slot,id]of Object.entries(s.equipped))assert(find(CLOTHES,id).slot===slot&&s.clothes.includes(id),'착용 의상 오류');
      for (const [id, share] of Object.entries(s.assetShares)) assert(find(ASSETS, id) && integer(share) && share <= 100, '지분 오류');
      for (const holding of Object.values(s.stocks)) assert(integer(holding.quantity) && Number.isFinite(holding.cost) && holding.cost >= 0, '주식 오류');
      for (const value of [s.study.totalMs, s.study.remainderMs, s.study.lastActivity, s.study.decayWeeks, s.income.lastTick, s.income.pending, s.income.accruedMs]) assert(Number.isFinite(value) && value >= 0, '시간·수익 오류');
      assert(s.study.remainderMs < (s.study.rateVersion===2?MINUTE:HOUR) && s.income.accruedMs <= 24 * HOUR, '시간 범위 오류');
    }
    snapshot() {
      return clone({...this.state, hourlyIncome: this.hourlyIncome(), marketConnected: !!this.market,
        stationConnected: !!this.station, minigame: this.session, loadError: this.loadError});
    }
    subscribe(listener) { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
    emit() { const snapshot = this.snapshot(); for (const listener of this.listeners) listener(snapshot); }
    save() {
      try { if (this.storage) this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
      catch (_) { this.loadError = '로컬 저장이 불가능합니다. 브라우저 저장공간을 확인해주세요.'; }
    }
    commit() { this.save(); this.emit(); }
    start() {
      if (this.timer) return;
      this.timer = root.setInterval(() => { this.tick(); this.commit(); }, 1000);
      this.onPageHide = () => { this.pauseStudy(); this.state.rest.running = false; this.save(); };
      if (root.addEventListener) root.addEventListener('pagehide', this.onPageHide);
    }
    destroy() {
      this.pauseStudy(); root.clearInterval(this.timer); this.timer = null;
      if (root.removeEventListener) root.removeEventListener('pagehide', this.onPageHide);
      this.listeners.clear();
    }
    debit(amount) {
      assert(integer(amount, 0), '금액 오류'); assert(this.state.cash >= amount, '재화가 부족합니다.'); this.state.cash -= amount;
    }
    credit(amount) {
      assert(integer(amount, 0) && Number.isSafeInteger(this.state.cash + amount), '재화 범위를 초과했습니다.'); this.state.cash += amount;
    }
    hourlyIncome() {
      return ASSETS.reduce((sum, a) => sum + a.price * a.rate * (this.state.assetShares[a.id] || 0) / 100, 0);
    }
    tick() {
      const s = this.state, time = this.now();
      const incomeMs = Math.max(0, time - s.income.lastTick);
      const rate = this.hourlyIncome();
      s.income.pending += rate * Math.min(incomeMs, 24 * HOUR - s.income.accruedMs) / HOUR;
      if (rate > 0) s.income.accruedMs = Math.min(24 * HOUR, s.income.accruedMs + incomeMs);
      s.income.lastTick = time;
      const study = s.study;
      const absentWeeks = Math.floor(Math.max(0, time - study.lastActivity) / WEEK);
      const decay = Math.max(0, absentWeeks - study.decayWeeks);
      s.intelligence = clamp(s.intelligence - decay); study.decayWeeks += decay;
      if (study.running) {
        const elapsed = Math.max(0, time - study.lastTick);
        // 브라우저가 장시간 정지된 구간은 제외. 정상 백그라운드 타이머는 누적.
        if (elapsed > 0 && elapsed <= MINUTE) {
          study.totalMs += elapsed; study.remainderMs += elapsed;
          s.intelligence = clamp(s.intelligence + Math.floor(study.remainderMs / MINUTE));
          study.remainderMs %= MINUTE; study.lastActivity = time; study.decayWeeks = 0;
        }
      }
      study.lastTick = time;
      if (s.rest.running) {
        const minutes = Math.floor(Math.max(0, time - s.rest.lastTick) / MINUTE);
        if (minutes) { s.health = clamp(s.health + minutes); s.mental = clamp(s.mental + minutes); s.rest.lastTick += minutes * MINUTE; }
      }
      if(this.session?.type==='cafe') {
        const cafe=this.session;
        if(!cafe.paused)cafe.remainingMs=Math.max(0,cafe.remainingMs-Math.max(0,time-cafe.lastTick));
        cafe.lastTick=time;
        if(cafe.remainingMs<=0)this.finishMinigame('completed');
      }
      if (this.session?.type === 'construction' && time >= this.session.endAt) this.finishMinigame('timeout');
      if (this.shift && time >= this.shift.endAt) {
        this.credit(this.shift.pay); s.lastResult = {type: 'work', earned: this.shift.pay}; this.shift = null; this.busy = false;
      }
    }
    claimIncome() {
      this.tick(); const amount = Math.floor(this.state.income.pending); this.credit(amount);
      this.state.income.pending -= amount; this.state.income.accruedMs = 0; this.commit(); return amount;
    }
    visit(id, activity) {
      const place = find(LOCATIONS, id); const selected = activity || place.activities[0];
      assert(place.activities.includes(selected), '이 장소에서 할 수 없는 활동입니다.');
      this.state.location = id; this.state.activity = selected;
      if (!this.state.visited.includes(id)) this.state.visited.push(id);
      this.commit(); return clone(place);
    }
    consume(id) {
      const item = find(ITEMS, id);
      if (item.activity !== 'leisure') assert(find(LOCATIONS, this.state.location).activities.includes(item.activity), '식당 또는 카페가 있는 장소로 이동해주세요.');
      const recovered = Math.min(item.recovery, 100 - this.state[item.stat]);
      assert(recovered > 0, '이미 최대치입니다.'); this.debit(item.price);
      this.state[item.stat] += recovered; this.state.activity = item.activity; this.state.lastConsumed = id;
      if(id==='park'){
        this.state.location='lotteworld';
        if(!this.state.visited.includes('lotteworld'))this.state.visited.push('lotteworld');
      }
      this.commit(); return recovered;
    }
    buyClothing(id) {
      const item = find(CLOTHES, id); assert(!this.state.clothes.includes(id), '이미 보유한 의상입니다.');
      this.debit(item.price); this.state.clothes.push(id); this.state.mental = clamp(this.state.mental + item.recovery); this.equip(id);
    }
    equip(id) {
      const item = find(CLOTHES, id); assert(this.state.clothes.includes(id), '먼저 의상을 구매해주세요.');
      if (item.slot === 'set') this.state.equipped = {set: id};
      else { delete this.state.equipped.set; this.state.equipped[item.slot] = id; }
      this.commit();
    }
    unequip(slot) { delete this.state.equipped[slot]; this.commit(); }
    startStudy() {
      assert(!this.busy && !this.state.rest.running, '진행 중인 활동을 마쳐주세요.');
      this.tick(); this.state.study.running = true; this.state.study.lastTick = this.now(); this.state.activity = 'study'; this.commit();
    }
    pauseStudy() { this.tick(); this.state.study.running = false; this.commit(); }
    rest(enabled = true) {
      assert(!enabled || (!this.busy && !this.state.study.running), '진행 중인 활동을 마쳐주세요.');
      this.tick(); this.state.rest = {running: enabled, lastTick: this.now()};
      if(enabled)this.state.activity='rest'; this.commit();
    }
    applyJob(id) {
      assert(!this.busy, '진행 중인 활동을 마쳐주세요.'); const job = find(JOBS, id);
      assert(this.state.intelligence >= job.intelligence, '필요 지능: ' + job.intelligence);
      this.state.job = id; this.commit();
    }
    spendEnergy(health, mental) {
      assert(!this.busy && !this.state.study.running && !this.state.rest.running, '진행 중인 활동을 마쳐주세요.');
      assert(this.state.health >= health && this.state.mental >= mental, '체력 또는 정신력을 회복해주세요.');
      this.state.health -= health; this.state.mental -= mental;
    }
    startShift() {
      const job = find(JOBS, this.state.job); this.spendEnergy(job.healthCost, job.mentalCost);
      this.busy = true; this.shift = {endAt: this.now() + job.duration, pay: job.pay}; this.commit();
    }
    buyAsset(id, percent = 1) {
      const asset = find(ASSETS, id); assert(integer(percent) && percent <= 100, '지분은 1~100% 정수입니다.');
      if (asset.type === 'car') assert(percent === 100, '자동차는 100% 단위로 구매합니다.');
      const owned = this.state.assetShares[id] || 0; assert(owned + percent <= 100, '최대 소유 지분은 100%입니다.');
      this.tick(); this.debit(Math.round(asset.price * percent / 100)); this.state.assetShares[id] = owned + percent; this.commit();
    }
    startMinigame(type) {
      assert(['construction', 'cafe'].includes(type), '알 수 없는 아르바이트입니다.');
      this.spendEnergy(type === 'construction' ? 20 : 15, type === 'construction' ? 15 : 20);
      const time = this.now(); this.busy = true;
      this.session = {type, startedAt: time, endAt: type === 'cafe' ? null : time + 20000, score: 0, combo: 0, bestCombo: 0, attempts: 0};
      if (type === 'construction') {
        Object.assign(this.session, {direction: 'right', height: 0, stairs: [{x: 0, y: 0}], lastStepAt: null});
        this.extendStairs(this.session);
      }
      else {
        Object.assign(this.session, {durationMs:60000, remainingMs:60000, lastTick:time, paused:false,
          drinks:0, mistakes:0, progress:0, feedback:'주문표 순서대로 재료를 눌러줘!', lastInputAt:null});
        this.nextCafeOrder();
      }
      this.commit(); return clone(this.session);
    }
    extendStairs(session) {
      // 앞으로 올라갈 계단을 미리 생성한다. 화면과 판정이 같은 경로를 사용한다.
      while (session.stairs.length < session.height + 12) {
        const previous = session.stairs[session.stairs.length - 1];
        const direction = previous.x >= 2 ? 'left' : previous.x <= -2 ? 'right' : this.random() < 0.5 ? 'left' : 'right';
        session.stairs.push({x: previous.x + (direction === 'right' ? 1 : -1), y: previous.y + 1, direction});
      }
      session.nextDirection = session.stairs[session.height + 1].direction;
    }
    stair(action) {
      this.tick(); const session = this.session; assert(session && session.type === 'construction', '공사장 게임을 시작해주세요.');
      assert(['up', 'turn'].includes(action), 'up 또는 turn을 사용해주세요.');
      if (session.lastStepAt !== null && this.now() - session.lastStepAt < 150) return clone(session);
      const expected = session.direction === session.nextDirection ? 'up' : 'turn';
      if (action !== expected) return this.finishMinigame('wrong-step');
      session.direction = session.nextDirection; session.height++; session.score += 500;
      session.lastStepAt = this.now();
      this.extendStairs(session);
      session.endAt = Math.min(session.startedAt + 60000, session.endAt + 200); this.commit(); return clone(session);
    }
    nextCafeOrder() {
      const recipes = [
        {name:'아이스 아메리카노', ingredients:[0,1]},
        {name:'아이스 카페라테', ingredients:[0,2,1]},
        {name:'아이스 바닐라라테', ingredients:[0,2,1,3]},
        {name:'바닐라 밀크', ingredients:[0,2,3]}
      ];
      const s=this.session;
      const index=(Math.floor(this.random()*recipes.length)+s.drinks)%recipes.length;
      s.order=clone(recipes[index]);s.progress=0;
    }
    pauseCafe(paused) {
      this.tick();
      if(this.session?.type!=='cafe')return;
      this.session.paused=!!paused;this.session.lastTick=this.now();this.commit();
    }
    addCafeIngredient(ingredient) {
      this.tick();const s=this.session;
      if(!s||s.type!=='cafe')return;
      assert(integer(ingredient,0)&&ingredient<=3,'올바른 재료를 선택해주세요.');
      if(s.paused)return 'PAUSED';
      if(s.lastInputAt!==null&&this.now()-s.lastInputAt<100)return 'WAIT';
      s.lastInputAt=this.now();s.attempts++;
      if(s.order.ingredients[s.progress]!==ingredient){
        s.mistakes++;s.combo=0;s.progress=0;s.feedback='앗, 재료가 달라! 첫 재료부터 다시 해보자.';
        this.commit();return 'WRONG';
      }
      s.progress++;s.feedback='좋아! 다음 재료를 넣어줘.';
      if(s.progress===s.order.ingredients.length){
        const name=s.order.name;s.drinks++;s.combo++;s.bestCombo=Math.max(s.combo,s.bestCombo);
        const pay=1000+Math.min(s.combo,10)*100;s.score+=pay;
        this.nextCafeOrder();s.feedback=name+' 서빙 완료! +'+money(pay);
        this.commit();return 'SERVED';
      }
      this.commit();return 'ADDED';
    }
    finishMinigame(reason = 'manual') {
      const session = this.session; if (!session) return null;
      const completed = session.type==='cafe' && reason==='completed' && session.remainingMs<=0;
      assert(reason!=='completed' || completed, '근무 시간을 채워야 완료 보너스를 받을 수 있습니다.');
      const bonus=completed?10000:0;
      const earned = 3000 + session.score + bonus;
      this.credit(earned); this.state.lastResult = {type: session.type, earned, height: session.height || 0, score: session.score, reason, runId: session.startedAt};
      if(session.type==='cafe')Object.assign(this.state.lastResult,{bonus,completed,
        mistakes:session.mistakes,bestCombo:session.bestCombo,drinks:session.drinks});
      this.session = null; this.busy = false; this.commit(); return clone(this.state.lastResult);
    }
    async trade(side, code, quantity) {
      assert(this.market, '실제 시세 공급 서버가 연결되지 않았습니다.');
      assert(!this.stockBusy, '이전 주문을 처리 중입니다.');
      assert(['buy', 'sell'].includes(side) && /^\d{6}$/.test(code) && integer(quantity), '주문 형식 오류');
      this.stockBusy = true;
      try {
        // 서버 어댑터: {code, name, exchange:'KOSPI'|'KOSDAQ', price,
        // timestamp는 조회 완료 시각. current-price 모델은 공개 표시한
        // '마지막 현재가로 게임 거래' 규칙이며 실시간 스트리밍과 구분한다.
        const quote = await this.market.getQuote(code);
        assert(quote && quote.code === code && ['KOSPI', 'KOSDAQ'].includes(quote.exchange), '지원하지 않는 종목입니다.');
        assert((quote.realtime === true || quote.executionModel === 'game-current-price') && quote.tradable === true, '거래 가능한 시세가 아닙니다.');
        assert(integer(quote.price) && Number.isFinite(quote.timestamp) && this.now() - quote.timestamp >= 0 && this.now() - quote.timestamp <= 60000, '시세가 오래되었거나 유효하지 않습니다.');
        const gross = quote.price * quantity; assert(integer(gross), '주문 금액 범위 초과');
        const fee = Math.ceil(gross * 0.001); const holding = this.state.stocks[code] || {name: quote.name, quantity: 0, cost: 0};
        if (side === 'buy') {
          assert(Number.isSafeInteger(holding.quantity + quantity), '보유 수량 범위 초과');
          this.debit(gross + fee); holding.quantity += quantity; holding.cost += gross + fee; this.state.stocks[code] = holding;
        } else {
          assert(holding.quantity >= quantity, '보유 주식이 부족합니다.'); this.credit(gross - fee);
          holding.cost *= (holding.quantity - quantity) / holding.quantity; holding.quantity -= quantity;
          if (!holding.quantity) delete this.state.stocks[code];
        }
        this.quotes[code] = quote;
        const record = {side, code, quantity, price: quote.price, fee, at: this.now()};
        this.state.trades.push(record); this.state.trades = this.state.trades.slice(-200); this.commit(); return clone(record);
      } finally { this.stockBusy = false; }
    }
    portfolio() {
      let stockValue = 0; const unpriced = [];
      for (const [code, holding] of Object.entries(this.state.stocks)) {
        const quote = this.quotes[code]; if (!quote) unpriced.push(code); else stockValue += quote.price * holding.quantity;
      }
      const assetValue = ASSETS.reduce((sum, a) => sum + a.price * (this.state.assetShares[a.id] || 0) / 100, 0);
      return {cash: this.state.cash, assetValue, stockValue, unpriced,
        // 미평가 종목이 있으면 총자산을 확정값으로 표시하지 않는다.
        total: unpriced.length ? null : this.state.cash + assetValue + stockValue,
        quoteTimes: Object.fromEntries(Object.entries(this.quotes).map(([code, q]) => [code, q.timestamp]))};
    }
    async refreshPortfolio() {
      assert(this.market, '실제 시세 공급 서버가 연결되지 않았습니다.');
      const quotes = await Promise.all(Object.keys(this.state.stocks).map(code => this.market.getQuote(code)));
      for (const quote of quotes) {
        assert(quote && Object.hasOwn(this.state.stocks, quote.code) && integer(quote.price) &&
          ['KOSPI', 'KOSDAQ'].includes(quote.exchange) && Number.isFinite(quote.timestamp) && quote.timestamp <= this.now(), '평가 시세 오류');
        this.quotes[quote.code] = quote;
      }
      this.emit(); return this.portfolio();
    }
    publicProfile() {
      return clone({nickname: this.state.nickname, equipped: this.state.equipped,
        job: this.state.job, health: this.state.health, mental: this.state.mental, intelligence: this.state.intelligence,
        assets: this.state.assetShares, portfolio: this.portfolio(), visited: this.state.visited});
    }
    async joinStation(onEvent) {
      assert(this.station, '부산역 멀티플레이 서버가 연결되지 않았습니다.');
      this.visit('station', 'plaza');
      // 어댑터가 로그인·채널 30명 제한·이동·프로필·신고·차단을 서버에서 처리.
      // 채팅 표시 시 innerHTML 대신 textContent를 사용한다.
      return this.station.join({profile: this.publicProfile(), onEvent});
    }
    async sendChat(text) {
      assert(this.station, '부산역 멀티플레이 서버가 연결되지 않았습니다.');
      assert(this.state.location === 'station', '부산역에서 대화할 수 있습니다.');
      assert(typeof text === 'string' && text.trim().length > 0 && text.trim().length <= 200, '메시지는 1~200자로 입력해주세요.');
      return this.station.send(text.trim());
    }
  }
  const API = {version: '0.1.0', data: clone(DATA), create: options => new Game(options), formatMoney: money};
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.BusangiGame = API;
})(typeof window !== 'undefined' ? window : globalThis);
