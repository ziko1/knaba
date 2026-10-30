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
  const cta = source.split('<section class="container bau-end-cta" aria-labelledby="bau-final-contact-title">')[1]?.split('</section>')[0];
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

test('informational pages use shared contact details rather than an extra contact strip', () => {
  const info = read('../src/components/ConstructionInfo.astro');
  assert.doesNotMatch(info, /company\.phoneHref|company\.phone|company\.email/, 'no second telephone/email strip');
  assert.match(info, /career\?career\.action:cta\.cta/, 'career/contact actions remain contextual');
  assert.match(info, /href=\{actionHref\}/, 'single final contextual call to action remains');
});

test('profile and contextual contacts suppress shared footer email duplicates', () => {
  const layout = read('../src/layouts/Layout.astro');
  assert.match(layout, /hasInlineEmail\?:\s*boolean/);
  assert.match(layout, /\{!hasInlineEmail\s*&&\s*<a/);
  const profile = read('../src/components/CompanyProfile.astro');
  assert.match(profile, /company\.phoneHref/);
  assert.match(profile, /mailto:/);
  assert.match(read('../src/components/ConstructionHome.astro'), /<Layout hasInlinePhone hasInlineEmail/);
  assert.match(read('../src/components/ConstructionInfo.astro'), /hasInlinePhone=\{variant==='unternehmen'\}/);
  assert.match(read('../src/components/ConstructionInfo.astro'), /hasInlineEmail=\{variant==='unternehmen'\|\|variant==='karriere'\}/);
  assert.match(read('../src/components/ConstructionContact.astro'), /<Layout hasInlinePhone hasInlineEmail/);
});

test('no-JavaScript fallbacks use contextual mail without duplicating link', () => {
  for (const file of ['../src/pages/konto.astro','../src/pages/ru/konto.astro']) {
    assert.doesNotMatch(read(file), /<noscript>[\s\S]*?mailto:/, file);
  }
  const fallback = read('../src/components/ConstructionContact.astro').match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
  assert.ok(fallback, 'contact fallback must exist');
  assert.doesNotMatch(fallback, /<a\b/, 'fallback must use existing contextual email');
});

test('current contact page avoids redundant header, mobile and footer self-CTAs', () => {
  const layout = read('../src/layouts/Layout.astro');
  assert.match(layout, /const isContactPage = path === localPath\('\/kontakt\/'\)/);
  assert.match(layout, /\{!isContactPage && <a class="button button-dark nav-cta"/);
  assert.match(layout, /\{!isContactPage && <a href=\{localPath\("\/kontakt\/"\)\}/);
  assert.match(layout, /isContactPage \? localPath\("\/planer\/"\) : localPath\("\/kontakt\/"\)/);
  assert.match(layout, /isContactPage \? footerLabels\[0\] : translated\.quote/);
});

test('homepage has one prominent catalogue CTA and a distinct extra-works deep link', () => {
  const home = read('../src/components/ConstructionHome.astro');
  const offers = read('../src/data/construction-offers.ts');
  assert.match(home, /class="button button-outline bau-secondary-cta" href=\{catalog\}/);
  assert.doesNotMatch(home, /bau-services-more/, 'no duplicate below-card CTA or dead CSS');
  assert.match(home, /href=\{catalog\+'#zusatzarbeiten'\} class="button button-dark">\{t\.extrasCta\}/);
  assert.equal((offers.match(/\bextrasCta:/g)||[]).length,4,'localized contextual extras label');
  assert.match(home, /@media\(max-width:610px\)[^\n]*?\.bau-actions\{[^}]*flex-direction:column;/,'mobile buttons stack');
});

test('service details have two focused contact CTAs without removing pricing and phone', () => {
  const detail = read('../src/components/ConstructionDetail.astro');
  assert.equal((detail.match(/href=\{contact\}/g)||[]).length,2,'top and final contact CTA only');
  assert.match(detail, /href=\{company\.phoneHref\}/,'keep one direct phone');
  assert.match(detail, /class="container section section-tight service-quote"/,'retain pricing explanation');
  assert.match(detail, /class="container cta-banner"/,'keep conversion CTA after related services');
  assert.match(detail, /href=\{prefix\+'\/ratgeber\/'\}/,'keep advice navigation');
});

test('contact no-JavaScript guidance reuses visible contacts without repeating their values', () => {
  const contact = read('../src/components/ConstructionContact.astro');
  const fallback = contact.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
  assert.ok(fallback, 'contact no-script guidance exists');
  assert.match(fallback, /translated\.noScript/);
  assert.doesNotMatch(fallback, /company\.(?:phone|email)|href=\{|tel:|mailto:/);
  assert.equal((contact.match(/\bnoScript:/g)||[]).length,4,'available for all four locales');
});
