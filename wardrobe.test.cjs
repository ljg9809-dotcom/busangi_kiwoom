'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=require('./busangi-game.js'),wardrobe=require('./wardrobe-renderer.js'),scenes=require('./scene-assets.js');
test('굿즈 4종 가격·기존 구매 ID 유지·누락 없는 실제 의상 파일',()=>{
  const clothes=api.data.clothes;
  for(const [id,price] of [['shirt',15000],['white-shirt',15000],['sweatshirt',30000],['hoodie',30000]])assert.equal(clothes.find(i=>i.id===id).price,price);
  for(const id of ['shirt','cap','pants','hoodie','sneakers','jacket','busan-set'])assert.ok(clothes.some(i=>i.id===id));
  assert.equal(clothes.length,9);assert.equal(new Set(clothes.map(i=>i.frame)).size,9);
  assert.ok(clothes.every(i=>fs.existsSync(path.join(__dirname,i.image))));
  for(const action of wardrobe.actions){
    const name=wardrobe.files[action]||action;
    const png=fs.readFileSync(path.join(__dirname,'assets/wardrobe/atlases',name+'.png'));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert.equal(width*3,height*2);
    const wrapper=fs.readFileSync(path.join(__dirname,'assets/wardrobe/atlases',name+'.js'),'utf8');
    assert.ok(wrapper.includes('['+JSON.stringify(action)+']'));assert.ok(wrapper.includes(png.toString('base64')));
  }
});
test('상의·재킷·신발 동시 착용, 벗기, 세트 교체와 저장 후 복원',()=>{
  const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
  const game=api.create({storage,now:()=>10000000});game.state.cash=500000;
  for(const id of ['shirt','jacket','pants','cap','sneakers','hoodie','busan-set'])game.buyClothing(id);
  game.equip('hoodie');game.equip('jacket');game.equip('sneakers');game.equip('pants');game.equip('cap');
  let selected=wardrobe.selection(game.state.equipped);
  assert.equal(selected.frame,3);assert.deepEqual(selected.layers.map(l=>l.id),['jacket','pants','sneakers','cap']);
  game.unequip('outer');assert.ok(!wardrobe.selection(game.state.equipped).layers.some(l=>l.slot==='outer'));
  const loaded=api.create({storage,now:()=>10000000});assert.deepEqual(loaded.state.equipped,game.state.equipped);
  assert.equal(wardrobe.selection(loaded.state.equipped).frame,3);
  loaded.equip('busan-set');assert.deepEqual(loaded.state.equipped,{set:'busan-set'});assert.equal(wardrobe.selection(loaded.state.equipped).frame,5);
  loaded.equip('shirt');assert.deepEqual(loaded.state.equipped,{top:'shirt'});
  const cash=loaded.state.cash,mental=loaded.state.mental;loaded.equip('shirt');assert.equal(loaded.state.cash,cash);assert.equal(loaded.state.mental,mental);
});
test('행동을 바꾸어도 착용 상태 유지·미리보기는 실제 구매와 별개',()=>{
  const game=api.create({storage:null,now:()=>10000000});game.state.cash=100000;game.buyClothing('hoodie');
  const before=game.snapshot();
  const preview=wardrobe.withItem(before.equipped,'jacket');assert.deepEqual(game.state.equipped,{top:'hoodie'});assert.equal(preview.outer,'jacket');
  assert.equal(game.state.cash,before.cash);assert.ok(!game.state.clothes.includes('jacket'));
  for(const [activity,lastConsumed] of [['meal',null],['cafe',null],['view',null],['study',null],['rest',null],['leisure','pc'],['leisure','karaoke'],['leisure','movie'],['leisure','park']]){
    const state=game.snapshot();state.activity=activity;state.lastConsumed=lastConsumed;
    assert.ok(wardrobe.actions.includes(scenes.resolve(state).action));assert.equal(wardrobe.selection(state.equipped).frame,3);
  }
});

test('페이지 진입 즉시 기본 자세를 선택하고 저장된 행동·타이머는 유지',()=>{
 const s=api.create({storage:null}).snapshot();s.location='nampo';s.activity='meal';s.study.running=true;s.rest.running=true;
 const before=JSON.stringify(s);
 const home=scenes.resolve(s,'home');assert.equal(home.action,'stand');assert.equal(home.background,null);assert.equal(home.src,'assets/busangi-standing.png');
 const study=scenes.resolve(s,'study');assert.equal(study.action,'study');assert.equal(study.location,'study-room');
 const map=scenes.resolve(s,'map','view');assert.equal(map.action,'view');assert.equal(map.location,'nampo');assert.equal(map.background,'assets/backgrounds/nampo.png');
 const eat=scenes.resolve(s,'map');assert.equal(eat.action,'eat');assert.equal(JSON.stringify(s),before);
});
