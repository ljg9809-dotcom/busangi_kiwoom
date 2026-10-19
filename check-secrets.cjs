// Pre-push check. Never prints secrets or matching snippets.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {vault}=require('./kis-market.cjs');
async function main(){
  let credentials,token={};
  if(process.env.KIS_APP_KEY&&process.env.KIS_APP_SECRET)credentials={appKey:process.env.KIS_APP_KEY,appSecret:process.env.KIS_APP_SECRET};
  else{credentials=await vault('credentials');token=await vault('token-read');}
  if(!credentials.appKey||!credentials.appSecret)throw Error('Secret verification could not load the known API credentials.');
  const values=[credentials.appKey,credentials.appSecret,token.value].filter(Boolean);
  const needles=[...new Set(values.flatMap(v=>[v,encodeURIComponent(v),Buffer.from(v).toString('base64')]))].map(s=>Buffer.from(s));
  const git=args=>execFileSync('git',['-c','safe.directory='+__dirname,...args],{cwd:__dirname,stdio:['pipe','pipe','pipe'],maxBuffer:64*1024*1024});
  const files=git(['ls-files','--cached','-z']).toString('utf8').split('\0').filter(Boolean),bad=[];
  const root=path.resolve(__dirname)+path.sep;
  const knownPatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/ghp_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{40,}/,/(?:AKIA|ASIA)[A-Z0-9]{16}/];
  for(const file of files){
    const full=path.resolve(__dirname,file);
    if(!full.startsWith(root)||fs.lstatSync(full).isSymbolicLink()){bad.push(file);continue;}
    if(/(^|[\/])(?:\.busangi-private|node_modules)([\/]|$)|\.sqlite(?:-wal|-shm)?$|\.dpapi(?:\.json)?$|\.(?:pem|pfx|key)$|(^|[\/])\.env(?:\.|$)/i.test(file)&&!file.endsWith('.env.example')){bad.push(file);continue;}
    const bytes=git(['show',':'+file]);
    if(needles.some(n=>bytes.includes(n))||knownPatterns.some(re=>re.test(bytes.toString('utf8'))))bad.push(file);
  }
  if(bad.length){console.error('Push blocked: possible secret/private files:');for(const file of bad)console.error(file);process.exitCode=1;return;}
  console.log('PASS: '+files.length+' staged files checked; no known API key, secret, token or private data file included.');
}
main().catch(()=>{console.error('Secret scan could not complete. Push must remain blocked until verification succeeds.');process.exitCode=1;});
