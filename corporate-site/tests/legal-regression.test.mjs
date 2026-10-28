import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (relative) => readFileSync(new URL('../src/pages/' + relative, import.meta.url), 'utf8');
const requiredAnchors = [
  'verantwortlicher', 'website', 'kontakt', 'bewerbung', 'assistent',
  'konto', 'rollen', 'bewertungen', 'werbung', 'dienstleister',
  'drittland', 'speicherung', 'rechte',
];

for (const [locale, privacyPath, imprintPath] of [
  ['de', 'datenschutz.astro', 'impressum.astro'],
  ['ru', 'ru/datenschutz.astro', 'ru/impressum.astro'],
]) {
  test(`${locale}: privacy navigation targets exist and disclose current services`, () => {
    const privacy = source(privacyPath);
    for (const anchor of requiredAnchors) {
      assert.ok(privacy.includes(`aria-labelledby="${anchor}"`), `${locale}: missing privacy section ${anchor}`);
      assert.ok(privacy.includes(`id="${anchor}"`), `${locale}: missing privacy title ${anchor}`);
    }
    assert.match(privacy, /28\.\s*(?:Oktober|октября)\s*2026/);
    assert.match(privacy, /§ 25(?:\s+Abs\.)?.*TDDDG/);
    assert.match(privacy, /Turnstile/);
    assert.match(privacy, /§ 201 StGB/);
    assert.match(privacy, /Art\.\s*50 EU AI Act|статья 50 EU AI Act/);
    assert.match(privacy, /Art\.\s*12 Abs\.\s*3 DSGVO|статья 12\(3\) GDPR/);
    assert.match(privacy, /§ 7 UWG/);
    assert.match(privacy, /§ 147 AO/);
    assert.ok(privacy.includes('company.email'), 'privacy contact comes from shared company data');
  });

  test(`${locale}: legal notice is truthful about inquiries and published company data`, () => {
    const imprint = source(imprintPath);
    assert.match(imprint, /§ 5/);
    assert.match(imprint, /VSBG/);
    assert.match(imprint, /28\.\s*(?:Oktober|октября)\s*2026/);
    for (const token of ['company.street', 'company.city', 'company.email', 'company.vatId']) {
      assert.ok(imprint.includes(token), `${locale}: missing central company value ${token}`);
    }
    assert.ok(imprint.includes(privacyPath.startsWith('ru/') ? '/ru/datenschutz/' : '/datenschutz/'));
    assert.doesNotMatch(imprint, /§\s*5\s*TMG|ec\.europa\.eu\/consumers\/odr/i);
    assert.doesNotMatch(imprint, /AGB\s*gelten|отказ\s+от\s+всех\s+прав/i);
  });
}

test('legal source never represents a generic privacy acknowledgement as marketing consent', () => {
  for (const page of ['datenschutz.astro', 'ru/datenschutz.astro']) {
    const sourceCode = source(page);
    assert.match(sourceCode, /keine Einwilligung in Newsletter|не означают согласия на рассылки/);
    assert.match(sourceCode, /Einmal-Einladung|одноразовому приглашению/);
  }
});
