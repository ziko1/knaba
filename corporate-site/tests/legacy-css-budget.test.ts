import { describe, expect, it } from 'vitest';
import { transform } from 'lightningcss';
import {
  assertNoPrunedClassesInHtml,
  findUnusedLegacyStyleSymbols,
  legacyStyleCandidates,
  unusedLegacyStylesInSources,
} from '../scripts/legacy-css-budget.mjs';

describe('conservative historical CSS optimization', () => {
  it('retains reused names from markup, runtime selectors, DOM mutations and data', () => {
    const unused = unusedLegacyStylesInSources([
      '<div class="hero-copy">Content</div>',
      "document.querySelector('.service-card'); element.classList.add('map-grid');",
      '{"layoutClass":"planner-banner"}',
    ]);
    for (const used of ['hero-copy', 'service-card', 'map-grid', 'planner-banner']) {
      expect(unused).not.toContain(used);
    }
    expect(unused).toContain('brand-mark');
  });

  it('ignores style declarations but preserves usage outside the style block', () => {
    const unused = unusedLegacyStylesInSources([
      '<style>.hero-copy{color:red}.service-card{color:blue}</style><a class="service-card">A</a>',
    ]);
    expect(unused).toContain('hero-copy');
    expect(unused).not.toContain('service-card');
  });

  it.each([
    '<div class={`hero-${kind}`}>A</div>',
    "<div class={'hero-' + kind}>A</div>",
    "element.className = 'hero-' + kind;",
    "element.classList.add('hero-' + kind);",
    "element.setAttribute('class', 'hero-' + kind);",
  ])('retains all possible classes from a dynamic prefix: %s', source => {
    const unused = unusedLegacyStylesInSources([source]);
    expect(unused).not.toContain('hero-copy');
    expect(unused).not.toContain('hero-art');
  });

  it('retains possible suffixes and fails closed for unresolvable dynamic class values', () => {
    expect(unusedLegacyStylesInSources(["<div class={prefix + '-card'} />"])).not.toContain('service-card');
    expect(unusedLegacyStylesInSources(['<div class={runtimeClass} />'])).toEqual([]);
    expect(unusedLegacyStylesInSources(['<div classList={{[runtimeClass]: true}} />'])).toEqual([]);
    expect(unusedLegacyStylesInSources([])).toEqual([]);
    expect(findUnusedLegacyStyleSymbols('/path-that-does-not-exist/knaba')).toEqual([]);
  });

  it.each([
    '<div class={props.className || "fallback"} />',
    'element.className = "prefix " + remoteClass;',
    'element.setAttribute("class", condition ? "fallback" : remoteClass);',
  ])('fails closed when a known string is mixed with an unknown whole class: %s', source => {
    expect(unusedLegacyStylesInSources([source])).toEqual([]);
  });

  it('accepts complete literal choices, static class-map keys and anchored current runtime families', () => {
    const unused = unusedLegacyStylesInSources([
      '<li class={index() < step() || review() ? "completed" : ""} />',
      '<button classList={{"kncc-nav-item": true, "is-current": selected() === "overview"}} />',
      '<section class:list={["container", "company-profile", {"company-profile-compact": compact}]} />',
      '<p class={`ka-message ka-${item.sender}`} />',
    ]);
    expect(unused).toContain('hero-copy');
    expect(unused).toContain('service-card');
  });

  it('does not consider active construction, account, form or generic utility styles for pruning', () => {
    for (const active of ['bau-card', 'bau-hero', 'portal-badge', 'wizard', 'active', 'hidden', 'button']) {
      expect(legacyStyleCandidates).not.toContain(active);
    }
    const unused = findUnusedLegacyStyleSymbols();
    expect(unused.length).toBeGreaterThan(0);
    const optimized = transform({
      filename: 'fixture.css',
      code: Buffer.from('.service-card{color:red}.bau-card{color:blue}.portal-badge{display:flex}'),
      minify: true,
      unusedSymbols: unused,
    }).code.toString();
    expect(optimized).not.toContain('.service-card');
    expect(optimized).toContain('.bau-card');
    expect(optimized).toContain('.portal-badge');
  });

  it('rejects a pruned class in generated HTML, including entities and template content', () => {
    expect(() => assertNoPrunedClassesInHtml('<main class="bau-card"></main>', ['hero-copy'])).not.toThrow();
    expect(() => assertNoPrunedClassesInHtml('<main class="hero-copy"></main>', ['hero-copy'])).toThrow('active class hero-copy');
    expect(() => assertNoPrunedClassesInHtml('<template><a class="hero&#45;copy">A</a></template>', ['hero-copy'])).toThrow('active class hero-copy');
  });
});
