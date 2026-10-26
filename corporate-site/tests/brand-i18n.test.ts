import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import copy from '../src/data/brand-messages.json';
import {PUBLISHED_SITE_LOCALES,TARGET_LOCALE_CODES} from '../src/lib/locale-catalog';
import {SLOGANS,BRAND_DESCRIPTIONS,render3dLogo,SUPPORTED_LOCALES} from '../scripts/generate-knaba-3d-assets.mjs';

const layout=readFileSync(new URL('../src/layouts/Layout.astro',import.meta.url),'utf8');
describe('one approved KNABA brand catalog for the 99-locale release pipeline',()=>{
  it('never publishes a language without branded and reviewed copy',()=>{
    expect(SUPPORTED_LOCALES).toEqual([...PUBLISHED_SITE_LOCALES]);
    expect(Object.keys(copy)).toEqual([...PUBLISHED_SITE_LOCALES]);
    expect(TARGET_LOCALE_CODES).toHaveLength(99);
    for(const code of TARGET_LOCALE_CODES){
      expect(Object.hasOwn(copy,code)).toBe(PUBLISHED_SITE_LOCALES.includes(code as typeof PUBLISHED_SITE_LOCALES[number]));
    }
  });
  it('uses identical slogans in shared metadata and vector logo exports',()=>{
    for(const code of PUBLISHED_SITE_LOCALES){
      const record=copy[code];
      expect(record.descriptor.startsWith('KNABA')).toBe(true);
      expect(record.slogan).toBe(SLOGANS[code]);
      expect(record.svgDescription).toBe(BRAND_DESCRIPTIONS[code]);
      expect(record.slogan.length).toBeGreaterThan(20);
      for(const surface of ['header','footer'] as const){
        const svg=render3dLogo(surface,false,code);
        expect(svg).toContain('>'+record.slogan+'</text>');
        expect(svg).toContain(record.svgDescription);
        expect(svg).not.toMatch(/<script|<foreignObject|href="https?:/i);
        expect(render3dLogo(surface,true,code)).not.toContain('>'+record.slogan+'</text>');
      }
    }
  });
  it('localizes social cards on shared public and private layouts without static German art',()=>{
    expect(layout).toContain('brandMessages[lang]');
    expect(layout).toContain('const brandAlt = brand.descriptor');
    expect(layout).toContain("lang === 'de' ? 'knaba-social.png' : `knaba-social-${lang}.png`");
    expect(layout).toContain("new URL('/images/' + socialAsset, siteConfig.origin).href");
    expect(layout).toContain('<meta property="og:image" content={socialImage} />');
    expect(layout).toContain('<meta name="twitter:image" content={socialImage} />');
    expect(layout).toContain('src={logoAssets.header}');
    expect(layout).toContain("content={brandAlt + ' · ' + brand.slogan}");
    expect(layout).not.toContain("og:image:alt\" content=\"KnaBa · Baureinigung");
  });
});
