import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const text=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const gallery=text('../src/components/ConstructionGallery.astro');
const layout=text('../src/layouts/Layout.astro');
const nav=text('../src/lib/corporate-navigation.ts');
const offers=text('../src/data/construction-offers.ts');

test('KNABA gallery route is honestly presented as a work-process guide in all four locales',()=>{
  for (const title of [
    'So arbeitet KnaBa','How KnaBa works','Як працює KnaBa','Как работает KnaBa',
  ]) assert.ok(gallery.includes(title),'missing localized workflow title: '+title);
  for (const label of ['ARBEITSABLAUF','HOW WE WORK','РОБОЧІ ПРОЦЕСИ','РАБОЧИЕ ПРОЦЕССЫ']) {
    assert.ok(gallery.includes(label),'missing localized non-gallery label: '+label);
  }
  assert.doesNotMatch(gallery, /KNABA \/ GALERIE|KNABA \/ GALLERY|KNABA \/ ГАЛЕРЕЯ/);
});

test('schematic artwork remains labelled, never sold as a completed customer reference',()=>{
  assert.match(gallery,/keine Fotos konkreter Kundenaufträge/);
  assert.match(gallery,/not photographs of specific client work/);
  assert.match(gallery,/не фото виконаних замовлень/);
  assert.match(gallery,/не фотографии выполненных заказов/);
  assert.match(gallery,/loading="lazy" decoding="async"/);
  assert.doesNotMatch(gallery, /<img[^>]*src=["']https?:\/\//);
});

test('each work process links to one distinct canonical existing service, not four duplicate contact CTAs',()=>{
  assert.match(gallery,/const serviceSlugs=\[([^\]]+)\] as const;/);
  const array=[...gallery.match(/const serviceSlugs=\[([^\]]+)\] as const;/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(array,['baureinigung','bauhilfe','bauzwischenreinigung','bauendreinigung']);
  for (const slug of array) assert.match(offers,new RegExp("slug:'"+slug+"'"));
  assert.match(gallery,/href=\{prefix\+'\/bauleistungen\/'\+serviceSlugs\[index\]\+'\/'\}/);
  assert.match(gallery,/class="knaba-workflow-detail-link"/);
  assert.equal((gallery.match(/prefix\+'\/kontakt\/'/g)||[]).length,1,'one separate enquiry CTA remains');
});

test('shared header, mobile navigation and footer use honest translated work-process name',()=>{
  assert.match(layout,/\["\/galerie\/", "Arbeitsabläufe"\]/);
  assert.match(layout,/en:\[[^\]]*'How we work'/);
  assert.match(layout,/uk:\[[^\]]*'Як ми працюємо'/);
  assert.match(layout,/ru:\[[^\]]*'Как мы работаем'/);
  assert.match(layout,/de:"Arbeitsabläufe",en:"How we work",pl:"Przebieg prac \(DE\)",lt:"Darbų eiga \(DE\)",uk:"Як ми працюємо",ru:"Как мы работаем"/);
  for (const val of ['Arbeitsabläufe','How we work','Як ми працюємо','Как мы работаем']) {
    assert.ok(nav.includes(val),'breadcrumb not localized: '+val);
  }
});
