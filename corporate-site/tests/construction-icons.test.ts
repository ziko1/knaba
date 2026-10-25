import {describe, expect, it} from 'vitest';
import {constructionOffers} from '../src/data/construction-offers';
import {constructionIconPaths, constructionIconNames} from '../src/data/construction-icon-paths';

describe('one local SVG service icon registry for every published route', () => {
  it('covers exactly eight real offers and the planner without a fallback glyph', () => {
    const expected = [...constructionOffers.map(offer => offer.slug), 'project'].sort();
    expect(constructionIconNames.slice().sort()).toEqual(expected);
    expect(Object.keys(constructionIconPaths).sort()).toEqual(expected);
  });

  it('contains only fixed non-empty SVG path commands with no untrusted markup', () => {
    const values = Object.values(constructionIconPaths);
    expect(new Set(values).size).toBe(values.length);
    for (const path of values) {
      expect(path.length).toBeGreaterThan(25);
      expect(path).toMatch(/^M[-\d\s.,a-zA-Z]+$/);
      expect(path).not.toMatch(/<|>|https?:|javascript:|&|["']/i);
    }
  });
});
