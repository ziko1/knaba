import { describe, expect, it } from 'vitest';
import { normalizedArtifactBytes } from '../scripts/stable-artifact.mjs';

const page = (uidA: string, uidB: string, text='KnaBa') =>
  `<html><main><astro-island uid="${uidA}" renderer-url="/_astro/one.js">First</astro-island><astro-island uid="${uidB}" renderer-url="/_astro/two.js">${text}</astro-island></main></html>`;

describe('reproducible build-equivalence evidence', () => {
  it('ignores only randomly assigned Astro island instance IDs', () => {
    const left = Buffer.from(page('ab1', 'ZZ888'));
    const right = Buffer.from(page('R4long', '123'));
    expect(normalizedArtifactBytes('konto/index.html',left)).toEqual(normalizedArtifactBytes('konto/index.html',right));
    const canonical=normalizedArtifactBytes('konto/index.html',left).toString('utf8');
    expect(canonical).toContain('uid="island-1"');
    expect(canonical).toContain('uid="island-2"');
  });
  it('still detects meaningful content or code changes', () => {
    expect(normalizedArtifactBytes('konto/index.html',Buffer.from(page('AAA','BBB','Hello'))))
      .not.toEqual(normalizedArtifactBytes('konto/index.html',Buffer.from(page('CCC','DDD','Changed'))));
    expect(normalizedArtifactBytes('main.js',Buffer.from('uid="foo"'))).toEqual(Buffer.from('uid="foo"'));
  });
});
