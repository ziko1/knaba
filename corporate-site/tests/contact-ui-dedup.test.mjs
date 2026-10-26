import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the shared frame exposes only one default telephone link', () => {
  const layout = read('../src/layouts/Layout.astro');
  const topline = layout.split('<div class="topline">')[1]?.split('<header class="header">')[0];
  assert.ok(topline, 'topline must remain present');
  assert.doesNotMatch(topline, /phoneHref|tel:/, 'no redundant phone in top banner');
  assert.match(layout, /hasInlinePhone\?:\s*boolean/, 'explicit inline phone contract');
  assert.match(layout, /\{!hasInlinePhone\s*&&\s*<a href=\{company\.phoneHref\}>/, 'footer link is only a fallback');
  assert.match(layout, /telephone:\s*company\.phoneHref\.slice\(4\)/, 'schema uses canonical phone');
});

test('contextual telephone pages suppress the fallback, across localized routes', () => {
  for (const file of [
    '../src/components/ConstructionContact.astro',
    '../src/components/ConstructionDetail.astro',
    '../src/pages/impressum.astro',
    '../src/pages/datenschutz.astro',
    '../src/pages/ru/impressum.astro',
    '../src/pages/ru/datenschutz.astro',
  ]) {
    assert.match(read(file), /<Layout[\s\S]*?\bhasInlinePhone\b/, file);
  }
});

test('home closing conversion panel does not repeat the global telephone', () => {
  const source = read('../src/components/ConstructionHome.astro');
  const cta = source.split('<section class="container bau-end-cta">')[1]?.split('</section>')[0];
  assert.ok(cta, 'closing conversion panel exists');
  assert.doesNotMatch(cta, /company\.phone|phoneHref|tel:/);
  assert.match(cta, /href=\{contact\}/, 'contact path remains');
});

test('information cards do not repeat the same contact link for each card', () => {
  const source = read('../src/components/ConstructionInfo.astro');
  const cards = source.split('t.items.map(')[1]?.split('</article>')[0];
  assert.ok(cards, 'informational card map exists');
  assert.doesNotMatch(cards, /<a\b[^>]*href=\{prefix\+'\/kontakt\/'\}/, 'use existing final section CTA instead');
  assert.match(source, /class="container cta-banner"/, 'single final CTA is retained');
});

test('no-JavaScript portal help does not add a second telephone link', () => {
  for (const file of ['../src/pages/konto.astro', '../src/pages/ru/konto.astro']) {
    assert.doesNotMatch(read(file), /tel:/, file);
  }
});

test('service detail presents one opening and one closing inquiry CTA, without repeated aside or pricing links', () => {
  const detail = read('../src/components/ConstructionDetail.astro');
  assert.equal((detail.match(/href=\{contact\}/g) || []).length, 2,
    'only the hero and final section should link to the same enquiry');
  const aside = detail.split('<aside class="aside-card">')[1]?.split('</aside>')[0] || '';
  assert.doesNotMatch(aside, /href=\{contact\}/);
  assert.match(aside, /href=\{company\.phoneHref\}/, 'preserve direct phone access');
  const quote = detail.split('<section class="container section section-tight service-quote">')[1]?.split('</section>')[0] || '';
  assert.ok(quote.includes("{label('pricing')}"), 'keep pricing explanation');
  assert.doesNotMatch(quote, /href=\{contact\}/, 'pricing should not add an identical CTA');
});
