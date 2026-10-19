(function(root){
  'use strict';
  const normalize=s=>String(s).normalize('NFC').replace(/\s+/g,'').toLowerCase();
  function search(stocks,query){const q=normalize(query);if(!q)return [];return stocks.filter(s=>s.code.includes(q)||normalize(s.name).includes(q)).sort((a,b)=>(normalize(a.name)===q?-1:0)-(normalize(b.name)===q?-1:0)||a.name.localeCompare(b.name,'ko')).slice(0,12);}
  function resolve(stocks,query){const q=String(query).trim();if(/^\d{6}$/.test(q))return q;const found=stocks.filter(s=>normalize(s.name)===normalize(q));return found.length===1?found[0].code:null;}
  const api={search,resolve};root.BusangiStockSearch=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
