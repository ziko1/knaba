import { describe, expect, it } from 'vitest';
import { resolveSocialImageOrigin } from '../src/lib/social-image-origin';

const staging = { origin: 'https://kneba.vsp.rest', temporary: true };
const native = 'https://kneba-temporary-preview.just-fawn-8470.chatgpt.site';

describe('social image origin for native TEST publication', () => {
  it('serves temporary Sites share cards from the explicit deployed asset origin', () => {
    expect(resolveSocialImageOrigin(staging, 'sites', native + '/')).toBe(native);
  });

  it('keeps VPS and official social origins unchanged', () => {
    expect(resolveSocialImageOrigin(staging, undefined, native)).toBe(staging.origin);
    expect(resolveSocialImageOrigin(staging, 'vps', native)).toBe(staging.origin);
    expect(resolveSocialImageOrigin({ origin: 'https://knaba.de', temporary: false }, 'sites', native)).toBe('https://knaba.de');
  });

  it.each([undefined, '', 'http://preview.example', '//preview.example', 'javascript:alert(1)', 'https://user:password@preview.example', 'https://preview.example/subpath', 'https://preview.example/?token=private', 'https://preview.example/#fragment'])('rejects missing or non-origin native asset configuration: %s', value => {
    expect(() => resolveSocialImageOrigin(staging, 'sites', value)).toThrow('PUBLIC_KNABA_ASSET_ORIGIN');
  });
});
