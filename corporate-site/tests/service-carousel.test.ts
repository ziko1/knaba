import {describe, expect, it} from 'vitest';
import {constructionOffers} from '../src/data/construction-offers';
import {PUBLISHED_SITE_LOCALES} from '../src/lib/locale-catalog';
import {publishedPublicPaths} from '../src/lib/site-i18n';
import {getServiceCarouselSlides} from '../src/lib/service-carousel';

describe('KnaBa service hero carousel', () => {
  const locales = PUBLISHED_SITE_LOCALES;

  it.each(locales)('includes all eight published services and working locale paths: %s', locale => {
    const slides = getServiceCarouselSlides(locale);
    const detailLocale = locale === 'pl' || locale === 'lt' ? 'de' : locale;
    const prefix = detailLocale === 'de' ? '' : `/${detailLocale}`;
    expect(slides).toHaveLength(constructionOffers.length);
    expect(slides.map(slide => slide.slug)).toEqual(constructionOffers.map(offer => offer.slug));
    expect(slides.map(slide => slide.number)).toEqual(['01','02','03','04','05','06','07','08']);
    expect(new Set(slides.map(slide => slide.href)).size).toBe(slides.length);
    for (const slide of slides) {
      expect(slide.href).toBe(`${prefix}/bauleistungen/${slide.slug}/`);
      expect(slide.hrefLang).toBe(detailLocale);
      expect(publishedPublicPaths(detailLocale)).toContain(slide.href);
      expect(slide.title).toBeTruthy();
      expect(slide.description.length).toBeGreaterThan(15);
    }
    expect(slides.every(slide => !slide.href.includes('bueroreinigung'))).toBe(true);
  });

  it.each([
    ['pl', 'Sprzątanie budowlane', 'zapytanie'],
    ['lt', 'Statybų valymas', 'užklausa'],
  ] as const)('uses translated regional copy without inventing article routes: %s', (locale, title, enquiry) => {
    const slides = getServiceCarouselSlides(locale);
    const german = getServiceCarouselSlides('de');
    expect(slides[0].title).toBe(title);
    for (const [index, slide] of slides.entries()) {
      expect(slide.title).not.toBe(german[index].title);
      expect(slide.description).not.toBe(german[index].description);
      expect(slide.hrefLang).toBe('de');
      if (!slide.core) expect(slide.title).toContain(enquiry);
    }
  });

  it('keeps special building work enquiry-only and in the original catalogue order', () => {
    const slides = getServiceCarouselSlides('de');
    expect(slides.filter(slide => slide.core)).toHaveLength(5);
    expect(slides.filter(slide => !slide.core).map(slide => slide.slug))
      .toEqual(['kernbohrungen','durchbrueche','zusatzarbeiten']);
    expect(slides.filter(slide => !slide.core).every(slide => slide.title.includes('Anfrage'))).toBe(true);
  });
  it('ships seven optimized, distinct WebP illustrations for slides 02–08', async () => {
    const {readFile} = await import('node:fs/promises');
    const {createHash} = await import('node:crypto');
    const {fileURLToPath} = await import('node:url');
    const {join} = await import('node:path');
    const root = fileURLToPath(new URL('../public/illustrations/carousel/', import.meta.url));
    const slides = getServiceCarouselSlides('uk');
    const images = await Promise.all(slides.slice(1).map(slide =>
      readFile(join(root, slide.slug + '.webp'))
    ));
    expect(images).toHaveLength(7);
    expect(new Set(images.map(image => createHash('sha256').update(image).digest('hex'))).size).toBe(7);
    for (const image of images) {
      expect(image.length).toBeGreaterThan(10000);
      expect(image.length).toBeLessThan(100 * 1024);
      expect(image.toString('ascii', 0, 4)).toBe('RIFF');
      expect(image.toString('ascii', 8, 12)).toBe('WEBP');
      expect(image.readUInt32LE(4) + 8).toBe(image.length);
    }
  });

});
