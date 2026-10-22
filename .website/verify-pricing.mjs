import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('pricing/index.html', root), 'utf8');
for (const text of ['data-monthly="29.99" data-yearly="299.90"', 'data-monthly="299.99" data-yearly="2,999.90"',
  '3,000 tasks / month', '30,000 tasks / month', '3,000 per seat tasks / month',
  'First month free', 'One free month per account', 'Credit-funded plans are charged immediately', 'USD in India']) assert(html.includes(text), text);
const schema = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => JSON.parse(m[1])['@graph'] || []);
const offers = schema.find(x => x['@type'] === 'SoftwareApplication').offers;
assert.deepEqual(offers.map(x => x.price), ['0', '29.99', '299.99', '29.99']);
assert(offers.every(x => x.priceCurrency === 'USD'));
const content = fs.readFileSync(new URL('.website/content.json', root), 'utf8');
assert(!/19\.99|199\.99|unlimited tasks|1,000 (monthly )?tasks/i.test(content));
assert(content.includes('up to 1,000 pages'));
assert(!/^Disallow:/mi.test(fs.readFileSync(new URL('robots.txt', root), 'utf8')));
console.log('Website prices, task caps, free month, structured data and robots verified.');
