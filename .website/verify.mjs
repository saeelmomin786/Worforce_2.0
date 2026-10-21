import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const pages=JSON.parse(await fs.readFile('content.json','utf8'));
let checked=0;
for(const p of pages){const html=await fs.readFile('dist'+p.path+'index.html','utf8');assert(html.includes('<title>'));assert(html.includes('id="main"'));for(const m of html.matchAll(/(?:href|src)="(\/[^"#]*)/g)){let target=m[1].split('?')[0];if(!path.extname(target))target=target.replace(/\/?$/,'/')+'index.html';await fs.access('dist'+target);checked++;}}
console.log(`Verified ${pages.length} pages and ${checked} internal link/asset references.`);
const sitemap=await fs.readFile('dist/sitemap.xml','utf8');
for(const p of pages)assert(sitemap.includes('https://workforce.trackmystartup.com'+p.path+'</loc>'),'Missing sitemap page: '+p.path);
for(const p of pages){const html=await fs.readFile('dist'+p.path+'index.html','utf8');assert(html.includes('rel="canonical"'));for(const s of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(s[1]);}
console.log('Verified canonical URLs, valid structured-data JSON and sitemap coverage for every page.');
for(const p of pages.filter(p=>!p.path.startsWith('/legal/'))){const html=await fs.readFile('dist'+p.path+'index.html','utf8');assert(!/google.{0,30}key|aistudio|bring your own|BYOK|your own key/i.test(html),'Obsolete key messaging on '+p.path);}
console.log('Verified that obsolete Google-key marketing is absent from all nonlegal pages.');

for(const file of ['install.ps1','releases.json','BingSiteAuth.xml','.nojekyll'])assert((await fs.readFile('../'+file)).equals(await fs.readFile('dist/'+file)),'Preserved file differs: '+file);
const releaseMetadata=JSON.parse(await fs.readFile('../releases.json','utf8'));const download=await fs.readFile('dist/download/index.html','utf8');for(const platform of ['win','linux_x64','android'])assert(download.includes(releaseMetadata.builds[platform].file));
for(const p of pages){const html=await fs.readFile('dist'+p.path+'index.html','utf8');assert(!html.includes('workforce-reimagined.workspace-958227.chatgpt.site'));assert(html.includes('https://workforce.trackmystartup.com'+p.path));assert(!html.includes('/assets/boot.js'));}
console.log('Verified production URLs, current release links and preserved installer/verification files.');
let analyticsPages=0;
async function checkAnalytics(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await checkAnalytics(file);else if(entry.name==='index.html'||entry.name==='404.html'){const html=await fs.readFile(file,'utf8');assert.equal((html.match(/googletagmanager\.com\/gtag\/js\?id=G-RRCG90HGBS/g)||[]).length,1,'Google loader missing or duplicated: '+file);assert.equal((html.match(/gtag\('config', 'G-RRCG90HGBS'\)/g)||[]).length,1,'Google configuration missing or duplicated: '+file);assert(html.indexOf('googletagmanager.com')<html.indexOf('</head>'),'Google tag must be in head: '+file);analyticsPages++;}}}
await checkAnalytics('dist');
console.log(`Verified one Google Analytics tag on each of ${analyticsPages} pages.`);
