import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const prefix of ['/','/en/','/uk/','/ru/']){
  for(const route of ['','leistungen/']){
    const html=readFileSync(new URL('../dist/client/'+(prefix==='/'?'':prefix.slice(1))+route+'index.html',import.meta.url),'utf8');
    const expected=prefix+'planer/';
    assert.ok(html.includes('href="'+expected+'"'),prefix+route+' missing planner route');
    assert.ok(html.includes('bau-card-request')||html.includes('bau-offer-request'),prefix+route+' missing sixth CTA card');
    const cards=html.match(/class="bau-card(?: bau-card-request)?"/g)||[];
    const offers=html.match(/class="bau-offer(?: bau-offer-request)?"/g)||[];
    assert.equal(route ? offers.length : cards.length,6,prefix+route+' must have six tiles');
  }
}
console.log('8 localized home/service routes contain exactly six tiles and valid planner CTA');
