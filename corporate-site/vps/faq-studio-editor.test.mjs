import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPublishedPage} from './render-page.mjs';

const root='#main > section:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > section:nth-of-type(1) > div:nth-of-type(1)';
const question=root+' > details:nth-of-type(1) > summary:nth-of-type(1) > span:nth-of-type(1)';
const answer=root+' > details:nth-of-type(1) > p:nth-of-type(1)';
const html='<!doctype html><html lang="uk"><head><title>KnaBa FAQ</title><meta name="description" content="Construction FAQ"></head><body><main id="main"><section><div></div><div><div></div><div><section><div><details data-faq-entry="first"><summary><span>Старе питання</span><span aria-hidden="true">+</span></summary><p>Стара відповідь</p></details><details data-faq-entry="second"><summary><span>Друге питання</span></summary><p>Друга відповідь</p></details></div></section></div></div></section></main></body></html>';
const row=edits=>({published_version:1,published_json:JSON.stringify(edits)});

test('published FAQ question/answer leaf edits preserve accordion, second item and HTML escaping',()=>{
  const updated=renderPublishedPage(html,row([
    {selector:question,kind:'text',value:'Які роботи виконує KnaBa?'},
    {selector:answer,kind:'text',value:'Обсяг — за договором & графіком.'}
  ]));
  assert.match(updated,/>Які роботи виконує KnaBa\?<\/span>/);
  assert.match(updated,/>Обсяг — за договором &amp; графіком\.<\/p>/);
  assert.equal((updated.match(/<details\b/g)||[]).length,2);
  assert.match(updated,/data-faq-entry="second"/);
  assert.match(updated,/>Друга відповідь<\/p>/);
  assert.doesNotMatch(updated,/Старе питання|Стара відповідь/);
});
test('untrusted FAQ rich text fails closed instead of changing HTML',()=>{
  assert.equal(renderPublishedPage(html,row([{selector:answer,kind:'text',value:'<script>alert(1)</script>'}])),html);
});
