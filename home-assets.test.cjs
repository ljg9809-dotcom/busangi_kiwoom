const test=require('node:test'),assert=require('node:assert/strict'),api=require('./busangi-game.js');
test('총 자산은 보유 지분·주식 평가금액·현금 합계, 시세 미조회 시 합계 확정하지 않음',async()=>{
 const now=1000000;const game=api.create({storage:null,now:()=>now,market:{getQuote:async code=>({code,exchange:'KOSPI',price:75000,timestamp:now})}});
 const asset=api.data.assets[0];game.state.cash=12345;game.state.assetShares[asset.id]=1;game.state.stocks['005930']={name:'삼성전자',quantity:2,cost:100000};
 assert.equal(game.portfolio().total,null);assert.deepEqual(game.portfolio().unpriced,['005930']);
 const p=await game.refreshPortfolio();assert.equal(p.stockValue,150000);assert.equal(p.assetValue,asset.price/100);assert.equal(p.total,12345+asset.price/100+150000);
 game.state.income.pending=9999;assert.equal(game.portfolio().total,p.total);
});
