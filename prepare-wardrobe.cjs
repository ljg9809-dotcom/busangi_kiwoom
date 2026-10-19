// Encode the unchanged PNG files for safe canvas compositing on file:// pages.
// This packages bytes only; it never edits image pixels.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const directory=path.join(__dirname,'assets','wardrobe','atlases');
for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.png'))){
  const action=path.basename(name,'.png'),bytes=fs.readFileSync(path.join(directory,name));
  const payload='data:image/png;base64,'+bytes.toString('base64');
  fs.writeFileSync(path.join(directory,action+'.js'),'window.BusangiWardrobeSheets=window.BusangiWardrobeSheets||{};window.BusangiWardrobeSheets['+JSON.stringify(action.replace(/-v\d+$/,''))+']='+JSON.stringify(payload)+';\n');
  console.log('Packaged wardrobe pose: '+action);
}
