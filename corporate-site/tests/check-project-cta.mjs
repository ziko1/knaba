import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'parse5';

const slugs = [
  'baureinigung',
  'bauzwischenreinigung',
  'bauendreinigung',
  'project',
  'bauhilfe',
  'baustellenraeumung',
];
const getAttribute = (node, name) =>
  (node.attrs || []).find(attr => attr.name === name)?.value;
const hasClass = (node, name) =>
  (getAttribute(node, 'class') || '').split(/\s+/).includes(name);
function findFirst(node, match) {
  if (match(node)) return node;
  for (const child of node.childNodes || []) {
    const hit = findFirst(child, match);
    if (hit) return hit;
  }
  return null;
}
const textContent = (node) =>
  node.nodeName === '#text'
    ? node.value
    : (node.childNodes || []).map(textContent).join('');

for (const prefix of ['/', '/en/', '/uk/', '/ru/']) {
  for (const route of ['', 'leistungen/']) {
    const html = readFileSync(
      new URL('../dist/client/' + (prefix === '/' ? '' : prefix.slice(1)) + route + 'index.html', import.meta.url),
      'utf8',
    );
    const isHome = route === '';
    const grid = findFirst(parse(html), node =>
      node.nodeName === 'div' && hasClass(node, isHome ? 'bau-card-grid' : 'bau-offer-grid'),
    );
    assert.ok(grid, prefix + route + ': missing primary card grid');
    const cards = (grid.childNodes || []).filter(node => node.nodeName === 'a');
    assert.equal(cards.length, 6, prefix + route + ': six primary cards');

    const expectedLinks = slugs.map(slug =>
      slug === 'project' ? prefix + 'planer/' : prefix + 'bauleistungen/' + slug + '/',
    );
    assert.deepEqual(
      cards.map(card => getAttribute(card, 'href')),
      expectedLinks,
      prefix + route + ': card order / localised destinations',
    );

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const ordinal = findFirst(card, node => node.nodeName === 'span' && hasClass(node, 'bau-ordinal'));
      assert.ok(ordinal, prefix + route + ': ordinal missing at position ' + (i + 1));
      assert.equal(
        textContent(ordinal).trim(),
        String(i + 1).padStart(2, '0'),
        prefix + route + ': ordinal must be exactly two digits at position ' + (i + 1),
      );
      assert.equal(
        hasClass(card, isHome ? 'bau-card-request' : 'bau-offer-request'),
        i === 3,
        prefix + route + ': project CTA must be fourth and unique',
      );
    }
  }
}
console.log('PASS: 8 DE/EN/UK/RU home/catalogue routes, ordered links and exact 01–06 labels');
