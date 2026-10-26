import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {PUBLISHED_SITE_LOCALES, TARGET_LOCALE_CODES} from '../src/lib/locale-catalog';

const layout = readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');

describe('customer-facing language picker', () => {
  it('displays only translated pages and keeps internal translation roadmap out of the customer UI', () => {
    expect(PUBLISHED_SITE_LOCALES).toEqual(['de', 'en', 'uk', 'ru']);
    expect(layout).toContain('languages.map(item => <a data-language-switch');
    expect(layout).not.toMatch(/<LocaleCatalog\b/);
    expect(layout).not.toMatch(/import LocaleCatalog/);
  });

  it('retains the unreleased translation catalog for future work without advertising it', () => {
    expect(TARGET_LOCALE_CODES).toHaveLength(99);
  });
});
