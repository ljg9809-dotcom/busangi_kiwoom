 'use strict';
const fs=require('node:fs'),path=require('node:path');
const FILES=['index.html','style.css','busangi-game.js','busangi-ui.js','construction-scene.js','cafe-controller.js','scene-assets.js','market-client.js','wardrobe-renderer.js','stock-search.js','account-response.js','account-client.js','station-controller.js','ranking-client.js'];
const MEDIA=new Set(['.png','.jpg','.jpeg','.ttf','.ogg','.mp3','.wav','.js']);
function build(root=__dirname){
 root=path.resolve(root);const out=path.resolve(root,'dist');
 if(out!==path.join(root,'dist')||!out.startsWith(root+path.sep))throw Error('빌드 경로 오류');
 if(fs.existsSync(out)){
  if(fs.lstatSync(out).isSymbolicLink()||!fs.existsSync(path.join(out,'.busangi-build')))throw Error('기존 dist 폴더를 보호하기 위해 빌드를 중단했습니다.');
  fs.rmSync(out,{recursive:true,force:true});
 }
 fs.mkdirSync(out);fs.writeFileSync(path.join(out,'.busangi-build'),'Busangi allowlisted static build');
 const copy=relative=>{const from=path.join(root,relative),to=path.join(out,relative);if(fs.lstatSync(from).isSymbolicLink())throw Error('빌드에 심볼릭 링크를 포함할 수 없습니다.');fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
 for(const file of FILES)copy(file);
 function assets(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
  if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
  const name=path.join(dir,entry.name);if(entry.isDirectory())assets(name);else if(MEDIA.has(path.extname(entry.name).toLowerCase()))copy(name);
 }}assets('assets');return out;
}
if(require.main===module){build();console.log('Vercel 정적 빌드 완료: dist (서버 코드·키·회원 DB 제외)');}
module.exports={build,FILES};
