(function(root){
 'use strict';
 const unavailable='계정 서버에 연결하지 못했어. 잠시 후 다시 시도해줘. 계속되면 게임 서버 연결을 확인해줘.';
 async function read(response){
  const type=response.headers.get('content-type')||'';
  if(!type.toLowerCase().includes('application/json'))throw Error(unavailable);
  let data;try{data=await response.json();}catch{throw Error(unavailable);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error(unavailable);
  if(!response.ok){
   const safe=typeof data.error==='string'&&!/Unexpected|SyntaxError|<!doctype|<html|SQLITE_|JSON|ECONN|stack trace/i.test(data.error);
   const error=Error(safe?data.error:unavailable);error.conflict=response.status===409;throw error;
  }
  return data;
 }
 const api={read,unavailable};root.BusangiAccountResponse=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
