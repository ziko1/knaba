import {constructionOffers, localeValue} from '../data/construction-offers';
import type {ConstructionLocale} from '../data/construction-offers';

/** One source of truth for home-page slides and the published service detail routes. */
export function getServiceCarouselSlides(locale: ConstructionLocale) {
  const prefix = locale === 'de' ? '' : `/${locale}`;
  return constructionOffers.map((offer, index) => ({
    slug: offer.slug,
    number: String(index + 1).padStart(2, '0'),
    title: localeValue(offer.name, locale),
    description: localeValue(offer.description, locale),
    href: `${prefix}/bauleistungen/${offer.slug}/`,
    icon: offer.icon,
    core: offer.core,
  }));
}
