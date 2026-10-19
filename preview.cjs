// 로컬 확인: node preview.cjs → http://127.0.0.1:4173
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname, types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ttf':'font/ttf','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(_){res.writeHead(400).end();return;}
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()){res.writeHead(404).end();return;}
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    let start=0,end=stat.size-1;
    if(range){start=Number(range[1]);end=Math.min(end,range[2]?Number(range[2]):end);if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();return;}headers['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;}
    headers['Content-Length']=end-start+1;res.writeHead(range?206:200,headers);
    if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).pipe(res);
  });
}).listen(4173,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4173'));
