import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const layout = read('../src/layouts/Layout.astro');
const css = read('../src/styles/global.css');
const darkLogo = read('../public/images/knaba-construction-logo-footer.svg');
const lightLogo = read('../public/images/knaba-construction-logo.svg');

describe('KnaBa footer brand contrast', () => {
  it('uses the dark-background logo only in the footer, leaving header art intact', () => {
    expect(layout.match(/src="\/images\/knaba-construction-logo-footer\.svg"/g)).toHaveLength(1);
    expect(layout.match(/src="\/images\/knaba-construction-logo\.svg"/g)).toHaveLength(1);
    expect(layout).toContain('class="brand footer-brand construction-brand"');
  });
  it('has transparent SVG canvas, readable light wordmark and no third-party loads', () => {
    expect(darkLogo).toContain('viewBox="0 0 510 110"');
    expect(darkLogo).toContain('fill="#F6FFFA">KnaBa</text>');
    expect(darkLogo).toContain('fill="#A5E5D5">BAUREINIGUNG');
    expect(darkLogo).not.toContain('fill="#e5f8f3"');
    expect(darkLogo).not.toMatch(/<script|<foreignObject|https?:\/\//i);
    expect(lightLogo).toContain('fill="#093440">KnaBa</text>');
  });
  it('removes the light plaque and adds a keyboard focus indicator', () => {
    expect(css).toMatch(/\.footer-brand\.construction-brand\{background:transparent;/);
    expect(css).not.toContain('background:#f6fff6');
    expect(css).toContain('.footer-brand.construction-brand:focus-visible');
  });
});
