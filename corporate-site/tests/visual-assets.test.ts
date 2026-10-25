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
test('all localized homepages use branded construction illustrations', async () => {
  const page=await readFile(new URL('../src/components/ConstructionHome.astro',import.meta.url),'utf8');
  const carousel=await readFile(new URL('../src/components/ServiceCarousel.astro',import.meta.url),'utf8');
  const layout=await readFile(new URL('../src/layouts/Layout.astro',import.meta.url),'utf8');
  expect(page).toContain('<ServiceCarousel locale={locale} />');
  expect(carousel).toContain('src="/illustrations/baureinigung.svg"');
  expect(carousel).not.toContain('hero-cleaning.svg');
  expect(layout).toContain('/images/knaba-construction-logo.svg');
  expect(layout).not.toContain('class="brand-mark"');
});
test('new KnaBa brand marks are self-contained vector graphics',async()=>{
  for(const file of ['knaba-construction-logo.svg','knaba-construction-mark.svg']){
    const svg=await readFile(new URL('../public/images/'+file,import.meta.url),'utf8');
    expect(svg).toMatch(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).not.toMatch(/<script|<image|<foreignObject|href="https?:/i);
  }
});
