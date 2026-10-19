// 실행: node --test busangi-game.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('./busangi-game.js');
const scenes = require('./scene-assets.js');
const HOUR = 3600000, WEEK = 7 * 24 * HOUR;
function setup(extra = {}) {
  let time = 1000000;
  const game = api.create({storage: null, now: () => time, random: () => 0.75, ...extra});
  return {game, advance: ms => {time += ms; game.tick();}, now: () => time};
}
test('누적 공부·일시정지·주 단위 감소·지능 상한', () => {
  const {game, advance} = setup();
  game.startStudy();
  for (let i = 0; i < 25; i++) advance(60000);
  game.pauseStudy(); advance(HOUR); game.startStudy();
  for (let i = 0; i < 35; i++) advance(60000);
  assert.equal(game.state.intelligence, 60);
  assert.equal(game.state.study.totalMs, HOUR);
  game.pauseStudy(); advance(WEEK); assert.equal(game.state.intelligence, 59);
  game.state.intelligence = 10; advance(WEEK); assert.equal(game.state.intelligence, 9);
  game.tick(); assert.equal(game.state.intelligence, 9);
  game.state.intelligence = 100; game.startStudy();
  for (let i = 0; i < 60; i++) advance(60000);
  assert.equal(game.state.intelligence, 100);
});
test('실제 회복량·의상 최초 회복·무료 재착용', () => {
  const {game} = setup(); game.visit('nampo'); game.state.health = 70;
  assert.equal(game.consume('gukbap'), 30); assert.equal(game.state.cash, 20000);
  game.state.mental = 30; game.buyClothing('shirt'); assert.equal(game.state.mental, 50);
  game.equip('shirt'); assert.equal(game.state.mental, 50);
  assert.throws(() => game.buyClothing('shirt')); assert.equal(game.state.cash, 5000);
});
test('지분 수익·첫 매수 이전 시간 제외·24시간 상한·중복 수령 방지', () => {
  const {game, advance} = setup(); advance(48 * HOUR);
  game.state.cash = 2000000; game.buyAsset('saha', 1);
  assert.equal(game.state.cash, 1000000); assert.equal(game.hourlyIncome(), 2000);
  advance(30 * HOUR); assert.equal(game.claimIncome(), 48000);
  assert.equal(game.claimIncome(), 0); advance(HOUR); assert.equal(game.claimIncome(), 2000);
  assert.equal(game.portfolio().total, 2050000);
});
test('계단과 카페 판정·시간 종료·보상 중복 지급 방지', () => {
  const {game, advance} = setup(); game.startMinigame('construction');
  game.stair('up'); assert.equal(game.session.height, 1); advance(160); game.stair('turn');
  assert.equal(game.state.lastResult.earned, 3500);
  const cash = game.state.cash; game.finishMinigame(); assert.equal(game.state.cash, cash);
  game.startMinigame('cafe',{durationMs:14000,notes:[{at:1500,lane:3},{at:2500,lane:3}]});
  game.syncCafe(1500); assert.equal(game.hitNote(3), 'PERFECT');
  game.syncCafe(2500); game.hitNote(3); game.finishMinigame();
  assert.equal(game.session, null); assert.equal(game.state.lastResult.earned, 6200);
});
test('카페는 벽시계 대신 음원 위치로 판정하고, 완주 보너스는 종료 때 한 번만 지급',()=>{
  const {game,advance}=setup();
  game.startMinigame('cafe',{durationMs:3000,notes:[{at:1000,lane:0},{at:2000,lane:1}]});
  advance(30000);assert.ok(game.session);
  game.syncCafe(1000);assert.equal(game.hitNote(0),'PERFECT');
  game.pauseCafe(true);game.syncCafe(2500);assert.equal(game.session.playbackMs,1000);
  assert.equal(game.hitNote(1),'PAUSED');game.pauseCafe(false);
  assert.throws(()=>game.finishMinigame('completed'));assert.ok(game.session);
  game.syncCafe(2000);game.hitNote(1);game.syncCafe(3000);
  const cash=game.state.cash,result=game.finishMinigame('completed');
  assert.equal(result.bonus,10000);assert.equal(result.earned,16200);assert.equal(result.accuracy,100);
  assert.equal(game.state.cash,cash+16200);game.finishMinigame('completed');assert.equal(game.state.cash,cash+16200);
});
test('카페 중도 종료·지나간 노트·완주 조건 및 입력 데이터 검증',()=>{
  const {game}=setup();
  assert.throws(()=>game.startMinigame('cafe'));assert.equal(game.state.health,100);
  game.startMinigame('cafe',{durationMs:3000,notes:[{at:1000,lane:0},{at:2000,lane:1}]});
  game.syncCafe(1500);assert.equal(game.session.misses,1);game.syncCafe(1500);assert.equal(game.session.misses,1);
  assert.throws(()=>game.syncCafe(1000));
  const result=game.finishMinigame();assert.equal(result.bonus,0);assert.equal(result.completed,false);
});
test('미리 보이는 계단과 판정 일치·경로 범위·이동 중 중복 입력 방지', () => {
  const {game, advance} = setup(); game.startMinigame('construction');
  for (let i = 0; i < 30; i++) {
    const session = game.session, next = session.stairs[session.height + 1];
    assert.equal(session.nextDirection, next.direction);
    const expected = next.direction === session.direction ? 'up' : 'turn';
    const height = session.height;
    game.stair(expected); assert.equal(game.session.height, height + 1);
    game.stair('turn'); assert.equal(game.session.height, height + 1);
    assert.ok(game.session.stairs.every(step => Math.abs(step.x) <= 2));
    advance(160);
  }
  assert.equal(game.session.score, 15000);
  game.stair(game.session.direction === game.session.nextDirection ? 'turn' : 'up');
  assert.equal(game.state.lastResult.reason, 'wrong-step');
  assert.equal(game.state.lastResult.earned, 18000);
});
test('모의 매수·매도 수수료·시세 검증·기업수익과 분리', async () => {
  const context = setup(); const game = context.game;
  let price = 100000, realtime = true;
  game.market = {getQuote: async code => ({code, name: '테스트 종목', exchange: 'KOSPI', price,
    timestamp: context.now(), tradable: true, realtime})};
  game.state.cash = 2000000; await game.trade('buy', '005930', 10);
  assert.equal(game.state.cash, 999000); assert.equal(game.hourlyIncome(), 0);
  price = 110000; await game.trade('sell', '005930', 10);
  assert.equal(game.state.cash, 2097900); assert.equal(game.state.stocks['005930'], undefined);
  realtime = false; await assert.rejects(game.trade('buy', '005930', 1));
  assert.equal(game.state.cash, 2097900);
  const disconnected = setup().game;
  await assert.rejects(disconnected.trade('buy', '005930', 1));
  await assert.rejects(disconnected.sendChat('안녕'));
});
test('저장 후 재실행 시 닫혀 있던 시간은 공부로 인정하지 않음', () => {
  const entries = new Map(); const storage = {getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value)};
  const {game, advance, now} = setup({storage}); game.startStudy(); advance(60000); game.save();
  const loaded = api.create({storage, now: () => now() + HOUR});
  assert.equal(loaded.state.study.running, false);
  assert.equal(loaded.state.study.totalMs, 60000);
  assert.equal(loaded.state.intelligence, 1);
});
test('식사·음료 구매와 독서실·휴식의 배너 행동이 실제 상태를 따라감',()=>{
  const {game}=setup();
  assert.equal(scenes.resolve(game.snapshot()).action,'idle');
  game.startMinigame('construction');game.finishMinigame();game.visit('nampo','meal');
  game.consume('hotteok');assert.equal(scenes.resolve(game.snapshot()).action,'eat');
  game.consume('americano');assert.equal(scenes.resolve(game.snapshot()).action,'drink');
  assert.equal(game.state.lastConsumed,'americano');
  game.visit('songdo','view');assert.equal(scenes.resolve(game.snapshot()).action,'view');
  game.startStudy();assert.equal(scenes.resolve(game.snapshot()).location,'study-room');
  assert.equal(scenes.resolve(game.snapshot()).action,'study');
  game.pauseStudy();assert.equal(scenes.resolve(game.snapshot()).action,'study');
  game.rest(true);assert.equal(scenes.resolve(game.snapshot()).action,'rest');
  assert.equal(scenes.resolve(game.snapshot()).location,'home');
});
test('여가 활동별 자세와 분리된 배경 설정',()=>{
  const {game}=setup();game.state.mental=10;game.consume('pc');
  assert.equal(scenes.resolve(game.snapshot()).action,'pc');
  for(const [item,action] of [['coin-song','karaoke'],['karaoke','karaoke'],['movie','movie'],['park','park']]){
    const s=game.snapshot();s.lastConsumed=item;
    assert.equal(scenes.resolve(s).action,action);
  }
  const s=game.snapshot();s.activity='meal';s.location='gwangalli';
  assert.equal(scenes.resolve(s).background,'assets/backgrounds/gwangalli.png');
  scenes.backgrounds.gwangalli.meal='assets/test-only.png';
  assert.equal(scenes.resolve(s).background,'assets/test-only.png');
  scenes.backgrounds.gwangalli.meal=null;
});
test('놀이공원 구매는 롯데월드 장면과 방문 도감에 연결',()=>{
  const {game}=setup();game.state.cash=100000;game.state.mental=10;
  game.consume('park');
  assert.equal(game.state.location,'lotteworld');assert.ok(game.state.visited.includes('lotteworld'));
  const scene=scenes.resolve(game.snapshot());assert.equal(scene.action,'park');
  assert.equal(scene.background,'assets/backgrounds/lotteworld.png');
  game.state.mental=10;game.consume('pc');
  assert.equal(scenes.resolve(game.snapshot()).background,'assets/backgrounds/pc-room.png');
});
