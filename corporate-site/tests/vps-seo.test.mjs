import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPublishedSeo, editablePublicHtmlPath} from '../vps/seo.mjs';

const template = '<!doctype html><html><head><title>Old title</title>'+
  '<meta property="og:title" content="Old title" />'+
  '<meta name="twitter:title" content="Old title" />'+
  '<meta name="description" content="Old description" />'+
  '<meta property="og:description" content="Old description" />'+
  '<meta name="twitter:description" content="Old description" />'+
  '<meta name="robots" content="noindex, follow" />'+
  '<link rel="canonical" href="https://kneba.vsp.rest/" />'+
  '</head><body><main id="main"></main></body></html>';

function row(edits) {
  return {published_version:2,published_json:JSON.stringify(edits.map(([selector,value])=>({selector,kind:'text',value})))};
}

test('published SEO edits update HTML, OG and Twitter metadata consistently',()=>{
  const rendered=renderPublishedSeo(template,row([
    ['@title','KnaBa & verified construction'],
    ['@description','Baureinigung & Bauhelfer Berlin']
  ]));
  assert.match(rendered,/<title>KnaBa &amp; verified construction<\/title>/);
  for(const selector of ['property="og:title"','name="twitter:title"']){
    assert.ok(rendered.includes(selector+' content="KnaBa &amp; verified construction"'));
  }
  for(const selector of ['name="description"','property="og:description"','name="twitter:description"']){
    assert.ok(rendered.includes(selector+' content="Baureinigung &amp; Bauhelfer Berlin"'));
  }
  assert.match(rendered,/<meta name="robots" content="noindex, follow" \/>/);
  assert.match(rendered,/<link rel="canonical" href="https:\/\/kneba\.vsp\.rest\/" \/>/);
});

test('older template without Twitter tags remains backwards compatible',()=>{
  const oldTemplate=template.replace(/<meta name="twitter:(?:title|description)" content="[^"]*" \/>/g,'');
  const rendered=renderPublishedSeo(oldTemplate,row([['@title','Neu & sicher']]));
  assert.ok(rendered.includes('<title>Neu &amp; sicher</title>'));
  assert.ok(rendered.includes('property="og:title" content="Neu &amp; sicher"'));
  assert.ok(!rendered.includes('name="twitter:title"'));
});

test('malicious-looking text stays escaped; duplicate metadata fails closed',()=>{
  const hostile='<script>alert("x")</script>&';
  const rendered=renderPublishedSeo(template,row([['@title',hostile]]));
  assert.ok(rendered.includes('<title>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;</title>'));
  assert.ok(!rendered.includes('<title><script>'));
  const duplicate=template.replace('</head>','<meta property="og:title" content="duplicate" /></head>');
  assert.equal(renderPublishedSeo(duplicate,row([['@title','Different']])),duplicate);
  assert.equal(renderPublishedSeo(template,{published_version:0,published_json:'[]'}),template);
});

test('public-path eligibility excludes sensitive Studio and CRM routes',()=>{
  assert.equal(editablePublicHtmlPath('/leistungen/'),true);
  for(const path of ['/konto/','/postfach/','/studio/','/crm/','/api/','/portal/']) {
    assert.equal(editablePublicHtmlPath(path),false,path);
  }
});
