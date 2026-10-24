import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
const artwork = [
  'hero-cleaning', 'unterhaltsreinigung', 'bueroreinigung',
  'glasreinigung', 'baureinigung', 'grundreinigung', 'treppenreinigung',
] as const;
for (const name of artwork) {
  test('original self-contained cleaning art: ' + name, async () => {
    const svg = await readFile(new URL('../public/illustrations/' + name + '.svg', import.meta.url), 'utf8');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/<title>[^<]+<\/title>/);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).not.toMatch(/<script|<image|<foreignObject|xlink:href|href="https?:/i);
    expect((svg.match(/<g(?=[\s>])/g) || []).length).toBe((svg.match(/<\/g>/g) || []).length);
  });
}
test('homepages feature cleaning artwork instead of an empty-room hero', async () => {
  for (const file of ['../src/pages/index.astro', '../src/pages/ru/index.astro']) {
    const page = await readFile(new URL(file, import.meta.url), 'utf8');
    expect(page).toContain('src="/illustrations/hero-cleaning.svg"');
    expect(page).toContain('class="service-card-art"');
  }
});
