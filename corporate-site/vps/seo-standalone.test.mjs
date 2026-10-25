import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPublishedSeo,editablePublicHtmlPath} from './seo.mjs';

const html=[
  '<!doctype html><html><head><title>Old title | KnaBa</title>',
  '<meta name="description" content="Old desc" />',
  '<meta property="og:title" content="Old title" />',
  '<meta property="og:description" content="Old desc" />',
  '<meta name="twitter:title" content="Old title" />',
  '<meta name="twitter:description" content="Old desc" />',
  '<meta name="robots" content="noindex, follow" />',
  '<link rel="canonical" href="https://kneba.vsp.rest/bauleistungen/baureinigung/" />',
  '</head><body><h1>Unaffected body</h1></body></html>'
].join('\n');
const row=(selector,value)=>({published_version:1,published_json:JSON.stringify([{selector,kind:'text',value}])});
test('published Studio title survives whitespace before /> and updates both OG/Twitter',()=>{
  const result=renderPublishedSeo(html,row('@title','Bauendreinigung Berlin | KnaBa'));
  assert.notEqual(result,html,'SEO updates must be reflected in public HTML');
  assert.match(result,/<title>Bauendreinigung Berlin \| KnaBa<\/title>/);
  assert.match(result,/property="og:title" content="Bauendreinigung Berlin \| KnaBa"/);
  assert.match(result,/name="twitter:title" content="Bauendreinigung Berlin \| KnaBa"/);
  assert.match(result,/name="robots" content="noindex, follow"/);
  assert.match(result,/<h1>Unaffected body<\/h1>/);
});
test('Studio description safely escapes HTML while updating OG and Twitter',()=>{
  const result=renderPublishedSeo(html,row('@description','Baureinigung & Bauhilfe <b>Berlin</b>'));
  assert.match(result,/name="description" content="Baureinigung &amp; Bauhilfe &lt;b&gt;Berlin&lt;\/b&gt;"/);
  assert.match(result,/property="og:description" content="Baureinigung &amp; Bauhilfe/);
  assert.match(result,/name="twitter:description" content="Baureinigung &amp; Bauhilfe/);
  assert.ok(!result.includes('<b>Berlin</b>'));
});
test('drafts, missing Twitter tags and private routes fail closed',()=>{
  assert.equal(renderPublishedSeo(html,{...row('@title','Draft'),published_version:0}),html);
  assert.equal(renderPublishedSeo(html.replace(/<meta name="twitter:title"[^>]*>\n/,''),
    row('@title','New')),html);
  for(const p of ['/studio/','/konto/','/api/leads/','/admin/','/crm/'])
    assert.equal(editablePublicHtmlPath(p),false);
  assert.equal(editablePublicHtmlPath('/bauleistungen/baureinigung/'),true);
});
