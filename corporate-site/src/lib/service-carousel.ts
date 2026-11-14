import {constructionOffers, localeValue} from '../data/construction-offers';
import type {PublishedSiteLocale} from './locale-catalog';
import {extraOfferNames, extraOfferDescriptions} from './public-extra-locales';

/** One source of truth for home-page slides and the published service detail routes. */
export function getServiceCarouselSlides(locale: PublishedSiteLocale) {
  // PL/LT have translated entry pages, but service articles are still German.
  const regional = locale === 'pl' || locale === 'lt';
  const detailLocale = regional ? 'de' : locale;
  const prefix = detailLocale === 'de' ? '' : `/${detailLocale}`;
  return constructionOffers.map((offer, index) => ({
    slug: offer.slug,
    number: String(index + 1).padStart(2, '0'),
    title: regional ? extraOfferNames[locale][offer.slug] : localeValue(offer.name, locale),
    description: regional ? extraOfferDescriptions[locale][offer.slug] : localeValue(offer.description, locale),
    href: `${prefix}/bauleistungen/${offer.slug}/`,
    hrefLang: detailLocale,
    icon: offer.icon,
    core: offer.core,
  }));
}
