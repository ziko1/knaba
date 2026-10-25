import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPublishedPage} from './render-page.mjs';
const raw=readFileSync(new URL('../dist/client/index.html',import.meta.url),'utf8');
// Both release builds must keep their own explicitly selected canonical host.
const mode=process.env.KNABA_RELEASE_MODE;
if (!['official','vsp'].includes(mode)) throw Error('Explicit release mode required for VPS renderer QA');
const expectedOrigin=mode==='vsp'?'https://kneba.vsp.rest':'https://knaba.de';
const expectedCanonical=`rel="canonical" href="${expectedOrigin}/"`;
assert.ok(raw.includes(expectedCanonical), 'Build artifact must match selected release origin');
const textSelector='#main > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)';
const linkSelector='#main > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)';
const imageSelector='#main > section:nth-of-type(1) > div:nth-of-type(2) > img:nth-of-type(1)';
const row=entries=>({published_json:JSON.stringify(entries),published_version:1});
test('published leaf text and existing link/image attributes are rendered in actual HTML, without removing SVG icon',()=>{
  const result=renderPublishedPage(raw,row([
    {selector:textSelector,kind:'text',value:'Neue Bauleistungen & Qualität'},
    {selector:linkSelector,kind:'href',value:'/leistungen/baureinigung/'},
    {selector:imageSelector,kind:'alt',value:'KnaBa Reinigung & Bauhelfer'},
  ]));
  assert.match(result,/Neue Bauleistungen &amp; Qualität/);
  assert.doesNotMatch(result,/Neben der Baureinigung nennt KnaBa/);
  assert.match(result,/Bauhilfe anfragen/);
  assert.match(result,/href="\/leistungen\/baureinigung\/"/);
  assert.match(result,/alt="KnaBa Reinigung &amp; Bauhelfer"/);
  assert.match(result,/hero-cleaning\.svg/);
  assert.ok(result.includes(expectedCanonical), "Content publishing must preserve release canonical host");
  assert.ok(result.includes('<script'));
});
test('content edits in draft, invalid tokens and paths are never sent in HTML',()=>{
  assert.equal(renderPublishedPage(raw,{published_version:0,published_json:JSON.stringify([{selector:textSelector,kind:'text',value:'DRAFT'}])}),raw);
  assert.equal(renderPublishedPage(raw,row([{selector:textSelector,kind:'text',value:'<script>alert(1)</script>'}])),raw);
  assert.equal(renderPublishedPage(raw,row([{selector:linkSelector,kind:'href',value:'javascript:alert(1)'}])),raw);
  assert.equal(renderPublishedPage(raw,row([{selector:'#main > script:nth-of-type(1)',kind:'text',value:'oops'}])),raw);
});
test('missing/outdated selectors cannot corrupt HTML or remove scripts',()=>{
  assert.equal(renderPublishedPage(raw,row([{selector:'#main > section:nth-of-type(90) > p:nth-of-type(1)',kind:'text',value:'stale'}])),raw);
  assert.equal(renderPublishedPage(raw,{published_version:2,published_json:'oops'},raw),raw);
});
test('Server-side published color and SEO are escaped and stable',()=>{
  const result=renderPublishedPage(raw,row([
    {selector:textSelector,kind:'color',value:'#284f41'},
    {selector:'@title',kind:'text',value:'KnaBa & Bauhelfer'},
    {selector:'@description',kind:'text',value:'Unsere Bauhelfer & Reinigung in Berlin'},
  ]));
  assert.match(result,/style="color:#284f41"/);
  assert.match(result,/<title>KnaBa &amp; Bauhelfer<\/title>/);
  assert.match(result,/name="description" content="Unsere Bauhelfer &amp; Reinigung in Berlin"/);
  assert.ok(result.includes(expectedCanonical), "Content publishing must preserve release canonical host");
});
