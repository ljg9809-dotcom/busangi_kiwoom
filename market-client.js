(function(root){
  'use strict';
  const base=location.protocol==='file:'?'http://127.0.0.1:4173':'';
  async function read(route){
    let response;try{response=await fetch(base+route,{cache:'no-store',signal:AbortSignal.timeout(20000)});}
    catch{throw Error('시세 서버에 연결할 수 없어. 주식서버 시작 파일을 실행해줘.');}
    const data=await response.json();if(!response.ok)throw Error(data.error||'시세 조회에 실패했어.');return data;
  }
  root.BusangiMarket={
    async connect(){const s=await read('/api/market/status');if(!s.connected)throw Error(s.error||'시세 서버가 준비되지 않았어.');return {getQuote:code=>read('/api/market/quote?code='+encodeURIComponent(code))};}
  };
})(window);
