const test=require('node:test'),assert=require('node:assert/strict');
test('실제 서버의 출처 검사는 기본 주소와 main 별칭을 허용하고 위장 주소는 거부',async()=>{
 global.Deno={env:{get:name=>name==='BUSANGI_ALLOWED_ORIGINS'?'https://busangikiwoom.vercel.app':undefined}};
 try{
  const {handler}=await import('./supabase/functions/busangi-api/handler.mjs');
  for(const origin of ['https://busangikiwoom.vercel.app','https://busangikiwoom-git-main-ljg9809-7416.vercel.app']){
   const r=await handler(new Request('https://cloud.example/api/auth/register',{method:'OPTIONS',headers:{Origin:origin}}));
   assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Access-Control-Allow-Credentials'),'true');
  }
  for(const origin of ['null','https://untrusted.vercel.app','https://busangikiwoom.vercel.app.evil.example','http://busangikiwoom.vercel.app']){
   const r=await handler(new Request('https://cloud.example/api/auth/register',{method:'OPTIONS',headers:{Origin:origin,'X-Forwarded-Host':'busangikiwoom.vercel.app'}}));
   assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
  }
 }finally{delete global.Deno;}
});
