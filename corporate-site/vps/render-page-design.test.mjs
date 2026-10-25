import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPublishedPage} from './render-page.mjs';
const html='<!doctype html><html lang="de"><head><title>KNABA</title><meta name="description" content="Construction"></head><body><main id="main"><section style="margin:0"><h2 style="font-weight:bold">Old</h2><p>Text</p></section></main></body></html>';
const row=edits=>({published_version:1,published_json:JSON.stringify(edits)});
const block='#main > section:nth-of-type(1)';
const title=block+' > h2:nth-of-type(1)';
test('owner published section background+padding and headline font size combine safely',()=>{
  const actual=renderPublishedPage(html,row([
    {selector:block,kind:'background',value:'#103f50'},
    {selector:block,kind:'padding',value:'24'},
    {selector:title,kind:'fontSize',value:'40'},
    {selector:title,kind:'text',value:'Bau & Reinigung'}
  ]));
  assert.match(actual,/style="margin:0;background-color:#103f50;padding:24px"/);
  assert.match(actual,/style="font-weight:bold;font-size:40px"/);
  assert.match(actual,/>Bau &amp; Reinigung<\/h2>/);
  assert.equal((actual.match(/<section\b/g)||[]).length,1);
});
test('unsafe design tokens fail closed, preserving original HTML',()=>{
  assert.equal(renderPublishedPage(html,row([{selector:block,kind:'background',value:'url(http://evil.test/p)'}])),html);
  assert.equal(renderPublishedPage(html,row([{selector:title,kind:'fontSize',value:'999'}])),html);
});
