const test=require('node:test'),assert=require('node:assert/strict'),{read}=require('./account-response.js');
test('계정 API에 HTML·404·잘못된 JSON이 와도 기술 로그가 화면에 나오지 않음',async()=>{
 for(const response of [new Response('<!DOCTYPE html><html>404</html>',{status:404,headers:{'Content-Type':'text/html'}}),new Response('not json',{headers:{'Content-Type':'application/json'}}),new Response(JSON.stringify({error:'Unexpected token < in JSON'}),{status:500,headers:{'Content-Type':'application/json'}})]){
  await assert.rejects(read(response),error=>error.message.includes('계정 서버')&&!error.message.includes('Unexpected')&&!error.message.includes('<!DOCTYPE'));
 }
 const duplicate=new Response(JSON.stringify({error:'이미 사용 중인 닉네임이야.'}),{status:400,headers:{'Content-Type':'application/json'}});
 await assert.rejects(read(duplicate),/이미 사용 중/);
 const conflict=new Response(JSON.stringify({error:'다른 창에서 저장 내용이 바뀌었어.'}),{status:409,headers:{'Content-Type':'application/json'}});
 await assert.rejects(read(conflict),e=>e.conflict===true);
});
test('Vercel 배포는 HTTPS 영구 서버로만 API 연결, 정적 결과에 서버 코드·DB·키 파일 없음',()=>{
 const fs=require('node:fs'),path=require('node:path'),{deploymentConfig}=require('./deployment-config.cjs'),{build,FILES}=require('./build-vercel.cjs');
 assert.throws(()=>deploymentConfig({}));assert.throws(()=>deploymentConfig({BUSANGI_BACKEND_ORIGIN:'http://unsafe.example'}));assert.throws(()=>deploymentConfig({BUSANGI_BACKEND_ORIGIN:'https://user:secret@example.com'}));
 const c=deploymentConfig({BUSANGI_BACKEND_ORIGIN:'https://api.example.com'});assert.equal(c.rewrites[0].destination,'https://api.example.com/api/:path*');
 const cloud=deploymentConfig({BUSANGI_BACKEND_ORIGIN:'https://cloud.example.com',BUSANGI_BACKEND_MODE:'supabase'});assert.equal(cloud.rewrites[0].destination,'https://cloud.example.com/functions/v1/busangi-api/api/:path*');
 assert.throws(()=>deploymentConfig({BUSANGI_BACKEND_ORIGIN:'https://cloud.example.com',BUSANGI_BACKEND_MODE:'unknown'}));
 const out=build();for(const name of ['account-store.cjs','market-server.cjs','kis-vault.ps1','.env','accounts.sqlite','check-secrets.cjs'])assert.equal(fs.existsSync(path.join(out,name)),false);
 assert.ok(FILES.every(name=>fs.existsSync(path.join(out,name))));assert.ok(fs.existsSync(path.join(out,'assets/busangi-standing.png')));
});
