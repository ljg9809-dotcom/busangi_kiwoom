 'use strict';
function deploymentConfig(env){
 let origin;try{origin=new URL(env.BUSANGI_BACKEND_ORIGIN);}catch{throw Error('Vercel 환경 변수 BUSANGI_BACKEND_ORIGIN에 게임 서버 HTTPS 주소를 설정하세요.');}
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('BUSANGI_BACKEND_ORIGIN은 경로와 로그인 정보가 없는 HTTPS 서버 주소여야 합니다.');
 const cloud=env.BUSANGI_BACKEND_MODE==='supabase';
 if(env.BUSANGI_BACKEND_MODE&&!['supabase','node'].includes(env.BUSANGI_BACKEND_MODE))throw Error('지원하지 않는 백엔드 모드입니다.');
 return {framework:null,buildCommand:'node build-vercel.cjs',outputDirectory:'dist',
   rewrites:[{source:'/api/:path*',destination:origin.origin+(cloud?'/functions/v1/busangi-api':'')+'/api/:path*'}],
   headers:[{source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'}]},{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'}]}]};
}
module.exports={deploymentConfig};
