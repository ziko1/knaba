import { constructionOffers, type ConstructionOffer } from './construction-offers';

/**
 * Canonical six-card presentation for both homepage and service catalogue.
 * This is display order only: CRM service slugs and the eight-service carousel
 * retain their existing identity and ordering.
 */
export const constructionGridSequence = [
  'baureinigung',
  'bauzwischenreinigung',
  'bauendreinigung',
  'project',
  'bauhilfe',
  'baustellenraeumung',
] as const;

export type ConstructionGridCard =
  | { kind: 'service'; offer: ConstructionOffer }
  | { kind: 'project' };

export const constructionGridCards: readonly ConstructionGridCard[] =
  constructionGridSequence.map((slug): ConstructionGridCard => {
    if (slug === 'project') return { kind: 'project' };
    const offer = constructionOffers.find(item => item.slug === slug && item.core);
    if (!offer) throw new Error('Missing core construction offer: ' + slug);
    return { kind: 'service', offer };
  });

export const constructionGridOrdinal = (index: number): string =>
  String(index + 1).padStart(2, '0');
