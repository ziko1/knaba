/** Isolated KNABA brand regression: node --test scripts/check-knaba-3d-assets.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render3dLogo, SLOGANS, BRAND_DESCRIPTIONS, SUPPORTED_LOCALES } from './generate-knaba-3d-assets.mjs';
const variants = SUPPORTED_LOCALES.flatMap((locale) =>
  [['header', false],['footer', false],['header', true],['footer', true]]
    .map(([surface, compact]) => [
       locale, surface, compact,
       'knaba-3d-' + (compact?'mobile-':'') + surface +
          (locale === 'de' ? '' : '-' + locale) + '.svg'
    ])
);
for (const [locale, surface, compact, file] of variants) {
  test('reproducible localized transparent ' + file, () => {
    const source = readFileSync(new URL('../public/images/' + file, import.meta.url), 'utf8');
    assert.equal(source, render3dLogo(surface, compact, locale), 'source and generated art must match');
    assert.match(source, /<title id="knaba-title">KNABA<\/title>/);
    assert.equal((source.match(/fill="url\(#buildingLeft\)"/g) || []).length, 20);
    assert.match(source, /fill="url\(#limeAccent\)"/);
    assert.match(source, /fill="url\(#limeBase\)"/);
    assert.match(source, /#D8F779/);
    assert.ok(!source.includes('#FDBE38'));
    assert.ok(!/<script|<foreignObject|(?:href|src)="https?:/i.test(source), 'no active or external assets');
    assert.ok(!/fill="#(?:FBFCF7|102E36)"/.test(source), 'transparent');
    assert.ok(Buffer.byteLength(source) < 15000, 'bounded payload');
    assert.ok(source.includes(BRAND_DESCRIPTIONS[locale]), 'locale-specific SVG description');
    assert.equal(source.includes('>' + SLOGANS[locale] + '</text>'), !compact);
    assert.match(source, compact ? /viewBox="0 0 1140 280"/ : /viewBox="0 0 1140 350"/);
    for (const other of SUPPORTED_LOCALES) {
       if (other !== locale) assert.ok(!source.includes('>' + SLOGANS[other] + '</text>'));
    }
  });
}
test('approved locale registry is exact and free of filler',()=>{
 assert.deepEqual(SUPPORTED_LOCALES,['de','en','pl','lt','ru','uk']);
 for(const l of SUPPORTED_LOCALES){
   assert.ok(SLOGANS[l].length > 18);
   assert.ok(BRAND_DESCRIPTIONS[l].length > 20);
   assert.ok(!/TODO|TBD|Lorem/i.test(SLOGANS[l]));
 }
 assert.equal(SLOGANS.de,'Unser Ziel ist Ihre Wertschöpfung');
});
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
