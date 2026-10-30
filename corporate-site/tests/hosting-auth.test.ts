import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostingAuthentication, nativeSignInCopy } from '../src/lib/hosting-auth';

afterEach(() => vi.unstubAllEnvs());

describe('hosting authentication destinations', () => {
  it('uses the native gateway only for an explicit Sites build', () => {
    const auth = hostingAuthentication('sites');
    expect(auth.passwordAccounts).toBe(false);
    expect(auth.signIn('/konto/?lang=uk')).toBe('/signin-with-chatgpt?return_to=%2Fkonto%2F%3Flang%3Duk');
    expect(auth.signOut('/admin/?view=studio&lang=en')).toBe('/signout-with-chatgpt?return_to=%2Fadmin%2F%3Fview%3Dstudio%26lang%3Den');
    vi.stubEnv('PUBLIC_KNABA_AUTH_MODE', 'sites');
    expect(hostingAuthentication().native).toBe(true);
  });
  it('preserves password/invitation UI and existing VPS destinations by default', () => {
    for (const mode of [undefined, '', 'vps', 'unknown']) {
      const auth = hostingAuthentication(mode);
      expect(auth.passwordAccounts).toBe(true);
      expect(auth.signIn('/ru/konto/')).toBe('/login/?return_to=%2Fru%2Fkonto%2F');
      expect(auth.signOut('/admin/')).toBe('/logout/?return_to=%2Fadmin%2F');
    }
  });
  it('never forwards external destinations, control characters or auth loops', () => {
    for (const mode of ['sites', 'vps']) {
      const auth = hostingAuthentication(mode);
      for (const destination of ['https://example.com/', '//example.com/', '/\\example.com/', '/\nexample.com/', '/callback?code=test', '/login/', '/signout-with-chatgpt', '/..//outside.example/', '/x/..//outside.example/', '/%2e%2e//outside.example/']) {
        for (const href of [auth.signIn(destination), auth.signOut(destination)]) {
          expect(new URL(href, 'https://knaba.invalid').searchParams.get('return_to')).toBe('/konto/');
        }
      }
    }
  });
  it('provides native sign-in and role-approval guidance in all six published languages', () => {
    expect(Object.keys(nativeSignInCopy).sort()).toEqual(['de', 'en', 'lt', 'pl', 'ru', 'uk']);
    for (const copy of Object.values(nativeSignInCopy)) {
      expect(copy.button).toContain('ChatGPT');
      expect(copy.text.length).toBeGreaterThan(40);
      expect(copy.note).toContain('OpenAI');
    }
  });
});
