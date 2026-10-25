import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPublishedPage} from './render-page.mjs';

const raw=readFileSync(new URL('../dist/client/uk/ratgeber/bauendreinigung-vorbereiten/index.html',import.meta.url),'utf8');
const row=entries=>({published_version:1,published_json:JSON.stringify(entries)});
const titleSelector='#main > article:nth-of-type(1) > section:nth-of-type(1) > h1:nth-of-type(1)';
const graph=html=>JSON.parse(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1])['@graph'];
const edits=[
  {selector:titleSelector,kind:'text',value:'Чиста здача & наступні кроки'},
  {selector:'@description',kind:'text',value:'Підготовка та приймання: площі, матеріали й умови об’єкта.'},
];

test('published article edits keep JSON-LD aligned with rendered H1 and description',()=>{
  const result=renderPublishedPage(raw,row(edits));
  const before=graph(raw),after=graph(result);
  const article=after.find(item=>item['@type']==='Article');
  assert.match(result,/<h1[^>]*>Чиста здача &amp; наступні кроки<\/h1>/);
  assert.equal(article.headline,edits[0].value);
  assert.equal(article.description,edits[1].value);
  for(const key of ['@id','url','inLanguage','publisher','mainEntityOfPage'])
    assert.deepEqual(article[key],before.find(item=>item['@type']==='Article')[key]);
  assert.deepEqual(after.filter(item=>item['@type']!=='Article'),before.filter(item=>item['@type']!=='Article'));
  assert.equal(renderPublishedPage(result,row(edits)),result,'repeated rendering is idempotent');
});

test('article sync does not publish drafts, accept invalid HTML edits or rewrite malformed JSON-LD',()=>{
  assert.equal(renderPublishedPage(raw,{...row(edits),published_version:0}),raw);
  assert.equal(renderPublishedPage(raw,row([{...edits[0],value:'</script><script>alert(1)</script>'}])),raw);
  const malformed=raw.replace(/(<script[^>]*type="application\/ld\+json"[^>]*>)[\s\S]*?(<\/script>)/,'$1{invalid-json}$2');
  const result=renderPublishedPage(malformed,row(edits));
  assert.ok(result.includes('{invalid-json}'));
  assert.match(result,/<h1[^>]*>Чиста здача &amp; наступні кроки<\/h1>/);
});

test('a search title edit preserves visible article headline and unrelated structured data',()=>{
  const result=renderPublishedPage(raw,row([{selector:'@title',kind:'text',value:'Підготовка до прибирання | KnaBa'}]));
  assert.deepEqual(graph(result),graph(raw));
  assert.match(result,/<title>Підготовка до прибирання \| KnaBa<\/title>/);
});

test('only the canonical article is synchronized and ambiguous headings fail closed',()=>{
  const foreign={'@type':'Article',url:'https://example.invalid/other/',headline:'Other article',description:'Unrelated'};
  const fixture=raw.replace(/(<script[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/,(_,start,json,end)=>{
    const data=JSON.parse(json);data['@graph'].push(foreign);return start+JSON.stringify(data)+end;
  });
  assert.deepEqual(graph(renderPublishedPage(fixture,row(edits))).find(item=>item.url===foreign.url),foreign);
  const ambiguous=raw.replace('</h1>','</h1><h1>Second heading</h1>');
  assert.deepEqual(graph(renderPublishedPage(ambiguous,row(edits))),graph(ambiguous));
});
