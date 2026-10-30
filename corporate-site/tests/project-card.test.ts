import { describe, expect, it } from 'vitest';
import { projectCard } from '../src/data/construction-project-card';
import { constructionOffers } from '../src/data/construction-offers';
import { constructionGridCards, constructionGridOrdinal, constructionGridSequence } from '../src/data/construction-grid';

describe('KnaBa primary service grid and project CTA', () => {
  it('uses the requested six-card visual order without changing service identities', () => {
    const sequence = constructionGridCards.map(card =>
      card.kind === 'project' ? 'project' : card.offer.slug
    );
    expect(sequence).toEqual([
      'baureinigung',
      'bauzwischenreinigung',
      'bauendreinigung',
      'project',
      'bauhilfe',
      'baustellenraeumung',
    ]);
    expect(sequence).toEqual([...constructionGridSequence]);
    expect(sequence.filter(slug => slug === 'project')).toHaveLength(1);
    expect(sequence.filter(slug => slug !== 'project').sort()).toEqual(
      constructionOffers.filter(offer => offer.core).map(offer => offer.slug).sort()
    );
    expect(constructionGridCards.map((_, i) => constructionGridOrdinal(i))).toEqual(
      ['01', '02', '03', '04', '05', '06']
    );
  });

  it('provides a real localised project enquiry on every published locale', () => {
    expect(constructionOffers.filter(offer => offer.core)).toHaveLength(5);
    for (const locale of ['de', 'en', 'uk', 'ru'] as const) {
      expect(projectCard[locale].title.length).toBeGreaterThan(10);
      expect(projectCard[locale].description.length).toBeGreaterThan(40);
      expect(projectCard[locale].action).toBeTruthy();
    }
  });
});
