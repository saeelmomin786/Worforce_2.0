import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const origin='https://workforce.trackmystartup.com';
const key='6dd7918bd5d24d8588b131871a065a11';
const keyLocation=`${origin}/${key}.txt`;
const pageUrl=file=>file==='index.html'?origin+'/':origin+'/'+file.replace(/index\.html$/,'');
const isPage=file=>!file.startsWith('.')&&file!=='404.html'&&/\.html$/.test(file);
if(process.argv.includes('--test')){
 assert.equal(pageUrl('index.html'),origin+'/');
 assert.equal(pageUrl('blog/example/index.html'),origin+'/blog/example/');
 assert.equal(pageUrl('example.html'),origin+'/example.html');
 for(const file of ['404.html','.website/dist/index.html','assets/client.js'])assert(!isPage(file));
 assert(isPage('blog/example/index.html'));
 console.log('IndexNow URL selection checks passed.');
}else{
 const since=process.argv[2];
 const files=execFileSync('git',since?['diff','--name-only','-z',since,'HEAD']:['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(isPage);
 const pages=await Promise.all(files.map(async file=>({url:pageUrl(file),html:await fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;})})));
 if(pages.length){
  // Wait for production so crawlers see the version that triggered this notification.
  let ready=false;
  for(let attempt=0;attempt<30&&!ready;attempt++){
   const proof=await fetch(keyLocation,{signal:AbortSignal.timeout(15000)}).then(async r=>r.ok&&(await r.text()).trim()===key).catch(()=>false);
   const checks=proof?await Promise.all(pages.map(async p=>{
    try{const r=await fetch(p.url,{signal:AbortSignal.timeout(15000)});return p.html===null?r.status===404||r.status===410:r.ok&&(await r.text())===p.html;}catch{return false;}
   })):[];
   ready=proof&&checks.length===pages.length&&checks.every(Boolean);
   if(!ready){console.log('Waiting for production deployment…');await new Promise(resolve=>setTimeout(resolve,10000));}
  }
  assert(ready,'Production did not match the submitted pages; no IndexNow notification sent.');
  const response=await fetch('https://api.indexnow.org/indexnow',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({host:new URL(origin).host,key,keyLocation,urlList:pages.map(p=>p.url)}),signal:AbortSignal.timeout(30000)});
  assert([200,202].includes(response.status),`IndexNow rejected the submission (${response.status}): ${await response.text()}`);
  console.log(`IndexNow received ${pages.length} URLs (HTTP ${response.status}${response.status===202?'; key validation pending':''}).`);
 }else console.log('No public page changes to submit.');
}
