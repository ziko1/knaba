import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPublishedSeo } from './seo.mjs';

const html=readFileSync(new URL('../dist/client/index.html',import.meta.url),'utf8');
const title='KnaBa – neue Leistungen & Pflege';
const description='Gebäudereinigung & Bauhelfer in Berlin, persönliche Beratung.';
const dbRow=(entries,version=2)=>({published_json:JSON.stringify(entries),published_version:version});
test('published title and description update server HTML head, OG while preserving canonical/robots',()=>{
  const entries=[{selector:'@title',kind:'text',value:title},{selector:'@description',kind:'text',value:description}];
  const result=renderPublishedSeo(html,dbRow(entries));
  assert.notEqual(result,html);
  assert.match(result,/\<title\>KnaBa – neue Leistungen &amp; Pflege\<\/title\>/);
  assert.match(result,/\<meta property="og:title" content="KnaBa – neue Leistungen &amp; Pflege"\/?\>/);
  assert.match(result,/\<meta name="description" content="Gebäudereinigung &amp; Bauhelfer in Berlin, persönliche Beratung\."\/?\>/);
  assert.match(result,/\<meta property="og:description" content="Gebäudereinigung &amp; Bauhelfer in Berlin, persönliche Beratung\."\/?\>/);
  assert.match(result,/\<meta name="twitter:title" content="KnaBa – neue Leistungen &amp; Pflege"\/?\>/);
  assert.match(result,/\<meta name="twitter:description" content="Gebäudereinigung &amp; Bauhelfer in Berlin, persönliche Beratung\."\/?\>/);
  assert.ok(result.includes(html.match(/<link rel="canonical" href="[^"]+"\/?>/)?.[0]));
  assert.ok(result.includes(html.match(/<meta name="robots" content="[^"]+"\/?>/)?.[0]));
});
test('no drafts/empty/corrupt published or duplicate SEO entries are rendered',()=>{
  assert.equal(renderPublishedSeo(html,dbRow([{selector:'@title',kind:'text',value:'Draft only'}],0)),html);
  assert.equal(renderPublishedSeo(html,null),html);
  assert.equal(renderPublishedSeo(html,{published_json:'oops',published_version:5}),html);
  assert.equal(renderPublishedSeo(html,dbRow([{selector:'@title',kind:'text',value:'X'},{selector:'@title',kind:'text',value:'Y'}])),html);
});
test('untrusted content never creates script, attributes, or second tags',()=>{
  const payload='</title><script>alert("owner")</script> & "test"';
  const result=renderPublishedSeo(html,dbRow([{selector:'@title',kind:'text',value:payload}]));
  assert.equal((result.match(/<title>/g)||[]).length,1);
  assert.ok(!result.includes('<script>alert("owner")</script>'));
  assert.ok(result.includes('&lt;/title&gt;&lt;script&gt;'));
  assert.ok(result.includes('&quot;owner&quot;'));
  assert.ok(result.includes('&amp; &quot;test&quot;'));
});
test('title metadata updates do not change the body or head for non SEO edits',()=>{
  assert.equal(renderPublishedSeo(html,dbRow([{selector:'#main > section:nth-of-type(1) > p:nth-of-type(1)',kind:'text',value:'New text'}])),html);
  assert.ok(!renderPublishedSeo(html,dbRow([{selector:'@title',kind:'src',value:'/images/x.png'}])).includes('x.png'));
  assert.equal(renderPublishedSeo(html,dbRow([{selector:'@title',kind:'text',value:'x'.repeat(101)}])),html);
});
