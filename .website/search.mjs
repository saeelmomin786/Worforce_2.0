import fs from 'node:fs/promises';
export async function addSearchMetadata(pages){
 const origin=(process.env.SITE_ORIGIN||'https://workforce.trackmystartup.com').replace(/\/$/,'');
 const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 for(const p of pages){const url=origin+p.path;const graph=[{'@type':'WebPage','@id':url,name:p.title,description:p.summary,url,inLanguage:'en',isPartOf:{'@id':origin+'/#website'}}];
 if(p.path==='/')graph.push({'@type':'WebSite','@id':origin+'/#website',name:'Workforce 2.0',url:origin+'/'},{'@type':'Organization','@id':origin+'/#organization',name:'Workforce 2.0',url:origin+'/'});
 if(['/','/pricing/','/download/'].includes(p.path)){const app={'@type':'SoftwareApplication',name:'Workforce 2.0',applicationCategory:'BusinessApplication',operatingSystem:'Windows 10, Windows 11, Linux x86_64, Android',url:origin+'/',description:'An AI team for business research, drafting and workflows across connected apps.'};if(p.path==='/pricing/')app.offers=[['Free','0'],['Basic monthly','19.99'],['Pro monthly','199.99'],['Enterprise monthly per seat','19.99']].map(([name,price])=>({'@type':'Offer',name,price,priceCurrency:'USD',url}));graph.push(app);}
 if(p.path.startsWith('/blog/')&&p.path!=='/blog/')graph.push({'@type':'Article',headline:p.title,description:p.summary,mainEntityOfPage:url});
 if(p.path!=='/')graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:origin+'/'},{'@type':'ListItem',position:2,name:p.title,item:url}]});
 const schema=JSON.stringify({'@context':'https://schema.org','@graph':graph}).replaceAll('<','\\u003c');
 const file='dist'+p.path+'index.html';let html=await fs.readFile(file,'utf8');html=html.replace('</head>',`<link rel="canonical" href="${escape(url)}"><meta property="og:url" content="${escape(url)}"><meta name="robots" content="index, follow, max-image-preview:large"><script type="application/ld+json">${schema}</script></head>`);await fs.writeFile(file,html);
 }
 await fs.writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(p=>`<url><loc>${escape(origin+p.path)}</loc></url>`).join('')}</urlset>`);
 const robots=await fs.readFile('robots.source.txt','utf8');
 await fs.writeFile('dist/robots.txt',robots.replace(/Allow: \/\s*$/gm,'Allow: /\nDisallow: /.website/').replace(/^Sitemap:.*$/m,'Sitemap: '+origin+'/sitemap.xml'));
 await fs.writeFile('dist/llms.txt',`# Workforce 2.0\n\n> AI workers for business research, drafting and workflows. Workforce provides and selects the AI behind task workflows. Users focus on the output instead of choosing models.\n\nPages are available as complete HTML. Outbound approvals are enabled by default and configurable. Local storage and search differ from online AI processing and optional team sharing. Prices and limits are explained on the pricing and limitations pages.\n\n## Pages\n\n${pages.map(p=>`- [${p.title}](${origin+p.path}): ${p.summary}`).join('\n')}\n`);
 console.log('Added canonical URLs, JSON-LD, sitemap, robots.txt and supplementary llms.txt.');
}
