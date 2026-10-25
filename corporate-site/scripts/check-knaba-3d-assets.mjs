/** Isolated KNABA brand regression: node --test scripts/check-knaba-3d-assets.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render3dLogo } from './generate-knaba-3d-assets.mjs';
const variants = [
  ['header', false, 'knaba-3d-header.svg'],
  ['footer', false, 'knaba-3d-footer.svg'],
  ['header', true, 'knaba-3d-mobile-header.svg'],
  ['footer', true, 'knaba-3d-mobile-footer.svg'],
];
for (const [surface, compact, file] of variants) {
  test(`reproducible transparent ${file}`, () => {
    const source = readFileSync(new URL('../public/images/' + file, import.meta.url), 'utf8');
    assert.equal(source, render3dLogo(surface, compact), 'committed SVG matches generator');
    assert.match(source, /<title id="knaba-title">KNABA<\/title>/);
    assert.equal((source.match(/fill="url\(#buildingLeft\)"/g) || []).length, 20);
    assert.match(source, /fill="url\(#goldAccent\)"/);
    assert.ok(!/<script|<foreignObject|(?:href|src)="https?:/i.test(source), 'no active or external resources');
    assert.ok(!/fill="#(?:FBFCF7|102E36)"/.test(source), 'no background plates');
    assert.ok(Buffer.byteLength(source) < 15_000, 'bounded image payload');
    assert.equal(source.includes('Unser Ziel ist Ihre Wertschöpfung'), !compact);
    assert.match(source, compact ? /viewBox="0 0 1140 280"/ : /viewBox="0 0 1140 350"/);
  });
}
function srgbLuminance(hex) {
  const arr = hex.match(/[a-f\d]{2}/gi).map((h) => parseInt(h, 16) / 255);
  return arr.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const l = [srgbLuminance(a), srgbLuminance(b)].sort((a, b) => b - a);
  return (l[0] + 0.05) / (l[1] + 0.05);
}
test('dark slogan is readable on site paper token', () => assert.ok(contrast('#102F38', '#FBFCF7') >= 7));
test('light slogan is readable on current footer token', () => assert.ok(contrast('#F6FFFA', '#102E36') >= 7));
