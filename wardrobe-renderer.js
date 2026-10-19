/* Generated pose atlases + native Canvas paper-doll compositing.
   Each atlas: 3 columns x 3 rows, same action/pose in each cell.
   Clothes are artwork, face/skin/props remain monochrome. No key or server required. */
(function(root){
  'use strict';
  const slots={shirt:'top','white-shirt':'top',sweatshirt:'top',hoodie:'top',jacket:'outer','busan-set':'set',cap:'hat',pants:'bottom',sneakers:'shoes'};
  const frames={shirt:0,'white-shirt':1,sweatshirt:2,hoodie:3,jacket:4,'busan-set':5,cap:6,pants:7,sneakers:8};
  const actions=['idle','eat','drink','view','study','rest','pc','karaoke','movie','park'];
  const files={pc:'pc-v2',view:'view-v2'};
  function withItem(equipped,id){
    if(!slots[id])return {...equipped};
    if(slots[id]==='set')return {set:id};
    const next={...equipped};delete next.set;next[slots[id]]=id;return next;
  }
  function selection(equipped={}){
    const valid=Object.fromEntries(Object.entries(equipped).filter(([slot,id])=>slots[id]===slot));
    const primary=valid.set||valid.top||valid.outer;
    const layers=valid.set?[]:['bottom','shoes','hat'].filter(slot=>valid[slot]).map(slot=>({slot,id:valid[slot],frame:frames[valid[slot]]}));
    if(!valid.set&&valid.top&&valid.outer)layers.unshift({slot:'outer',id:valid.outer,frame:frames[valid.outer]});
    return {frame:primary?frames[primary]:8,neutral:!primary,layers,empty:!Object.keys(valid).length,key:Object.entries(valid).sort().map(e=>e.join(':')).join('|')};
  }
  const sheets=new Map(),composites=new Map(),layers=new Map();
  function loadSheet(action){
    if(sheets.has(action))return sheets.get(action);
    const pending=new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('의상 이미지를 불러오지 못했어.'));
      const embedded=location.protocol==='file:'||new URLSearchParams(location.search).get('assets')==='embedded';
      if(!embedded){image.src='assets/wardrobe/atlases/'+(files[action]||action)+'.png';return;}
      // Local file pages have opaque origins. Embedded data keeps canvas readable
      // so clipping accessories works without disabling browser protections.
      root.BusangiWardrobeSheets=root.BusangiWardrobeSheets||{};
      if(root.BusangiWardrobeSheets[action]){image.src=root.BusangiWardrobeSheets[action];return;}
      const script=document.createElement('script');script.src='assets/wardrobe/atlases/'+(files[action]||action)+'.js';
      script.onload=()=>{image.src=root.BusangiWardrobeSheets[action];script.remove();};
      script.onerror=()=>{script.remove();reject(Error('의상 파일이 없어. 새로고침해줘.'));};document.head.append(script);
    });sheets.set(action,pending);pending.catch(()=>sheets.delete(action));return pending;
  }
  function canvas(){const c=document.createElement('canvas');c.width=512;c.height=768;return c;}
  function frameCanvas(sheet,index,neutral=false,action=''){
    const c=canvas(),ctx=c.getContext('2d');const w=sheet.naturalWidth/3,h=sheet.naturalHeight/3;
    if(neutral)ctx.filter='grayscale(1)';
    ctx.drawImage(sheet,(index%3)*w,Math.floor(index/3)*h,w,h,0,0,c.width,c.height);
    // The cap in the next atlas row slightly enters the idle hoodie's gutter.
    // Exclude that gutter from this sprite's rendering, keeping both feet intact.
    if(action==='idle'&&index===3)ctx.clearRect(0,Math.ceil(c.height*.94),c.width,c.height);
    return c;
  }
  function accessoryLayer(sheet,action,layer){
    const key=action+':'+layer.id;if(layers.has(key))return layers.get(key);
    const c=frameCanvas(sheet,layer.frame,false,action),ctx=c.getContext('2d'),image=ctx.getImageData(0,0,c.width,c.height),p=image.data;
    const w=c.width,h=c.height,mask=new Uint8Array(w*h),expanded=new Uint8Array(w*h);
    const range=layer.slot==='hat'?[0,.35]:layer.slot==='shoes'?[.65,1]:layer.slot==='outer'?[0,.65]:[.38,.96];
    for(let y=Math.floor(range[0]*h);y<Math.ceil(range[1]*h);y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,r=p[i],g=p[i+1],b=p[i+2];
      const colored=layer.slot==='shoes'?g>r*1.15&&g>b*.93:layer.slot==='outer'?r>g*1.08&&b>g*1.12:b>r*1.12&&b>g*.95;
      if(p[i+3]>160&&Math.max(r,g,b)-Math.min(r,g,b)>35&&colored)mask[y*w+x]=1;
    }
    // Include adjoining black contour and crease pixels with each colored piece.
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x])for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)expanded[yy*w+xx]=1;
    }
    for(let i=0;i<expanded.length;i++)if(!expanded[i])p[i*4+3]=0;
    ctx.putImageData(image,0,0);layers.set(key,c);return c;
  }
  async function compose(action,equipped){
    if(!actions.includes(action))action='idle';
    const picked=selection(equipped),key=action+'|'+picked.key;
    if(composites.has(key))return composites.get(key);
    const sheet=await loadSheet(action),c=frameCanvas(sheet,picked.frame,picked.neutral,action),ctx=c.getContext('2d');
    for(const layer of picked.layers)ctx.drawImage(accessoryLayer(sheet,action,layer),0,0);
    const result=c.toDataURL('image/png');composites.set(key,result);
    if(composites.size>24)composites.delete(composites.keys().next().value);return result;
  }
  async function apply(image,scene,equipped={},description=''){
    const picked=selection(equipped),key=scene.action+'|'+picked.key;
    if(image.dataset.wardrobeKey===key)return;
    image.dataset.wardrobeKey=key;image.dataset.wardrobeStatus='loading';
    const alt=scene.alt+(description?' · '+description:'');
    if(picked.empty){image.src=scene.src;image.alt=alt;image.dataset.wardrobeStatus='ready';return;}
    try{const src=await compose(scene.action,equipped);if(image.dataset.wardrobeKey!==key)return;image.src=src;image.alt=alt;image.dataset.wardrobeStatus='ready';}
    catch(error){if(image.dataset.wardrobeKey!==key)return;image.src=scene.src;image.alt=scene.alt+' · 의상 이미지 로딩 실패';image.dataset.wardrobeStatus='error';delete image.dataset.wardrobeKey;}
  }
  const api={slots,frames,actions,files,withItem,selection,compose,apply};root.BusangiWardrobe=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
