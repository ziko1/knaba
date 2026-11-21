import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transpileModule, ScriptTarget, ModuleKind} from 'typescript';
import {describe, expect, it, vi} from 'vitest';

const source = readFileSync(new URL('../src/components/MobileAppPage.astro', import.meta.url), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw Error('Mobile page script missing');
const {outputText} = transpileModule(script, {
  compilerOptions: {target: ScriptTarget.ES2022, module: ModuleKind.ESNext},
});
const locales = ['de', 'en', 'pl', 'lt', 'ru', 'uk'] as const;
const states = ['anonymous', 'client', 'worker', 'partner', 'bauleiter', 'owner', 'admin',
  'http_error', 'network_error', 'json_error', 'timeout'] as const;

function mount(locale: string, state: typeof states[number]) {
  let click: ((event: {preventDefault: () => void}) => Promise<void>) | undefined;
  let reload: (() => void) | undefined;
  const navigate = vi.fn();
  const signal = new AbortController().signal;
  const timeout = vi.fn(() => signal);
  const fetch = vi.fn(async () => {
    if (state === 'network_error') throw new TypeError('Synthetic network failure');
    if (state === 'timeout') throw new DOMException('Synthetic timeout', 'TimeoutError');
    return {ok: state !== 'http_error', json: async () => {
      if (state === 'json_error') throw new SyntaxError('Synthetic invalid JSON');
      return {role: state};
    }};
  });
  const bind = vi.fn((_event: string, handler: typeof click) => { click = handler; });
  const anchor = {
    dataset: {adminHref: `/admin/?lang=${locale}`},
    getAttribute: (name: string) => name === 'href' ? `/konto/?lang=${locale}` : null,
    setAttribute: vi.fn(), addEventListener: bind,
  };
  runInNewContext(outputText, {
    document: {
      querySelector: (selector: string) => selector === '[data-knaba-app-account]' ? anchor : null,
      addEventListener: (_event: string, handler: () => void) => { reload = handler; },
    },
    window: {addEventListener: vi.fn()}, navigator: {}, fetch,
    location: {assign: navigate}, AbortSignal: {timeout},
  });
  if (!click || !reload) throw Error('Mobile navigation handler was not bound');
  return {click, reload, navigate, fetch, timeout, signal, bind};
}

describe('mobile account navigation retains the explicitly selected language', () => {
  for (const locale of locales) {
    for (const state of states) {
      it(`${locale}: ${state}`, async () => {
        const app = mount(locale, state);
        const preventDefault = vi.fn();
        await app.click({preventDefault});
        const path = state === 'owner' || state === 'admin' ? '/admin/' : '/konto/';
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(app.navigate).toHaveBeenCalledExactlyOnceWith(`${path}?lang=${locale}`);
        expect(app.fetch).toHaveBeenCalledExactlyOnceWith('/api/portal/session', {
          credentials: 'same-origin', cache: 'no-store',
          headers: {Accept: 'application/json'}, signal: app.signal,
        });
        expect(app.timeout).toHaveBeenCalledExactlyOnceWith(8000);
      });
    }
  }

  it('does not bind a second session request after Astro page initialization repeats', async () => {
    const app = mount('pl', 'client');
    app.reload();
    expect(app.bind).toHaveBeenCalledOnce();
    await app.click({preventDefault: vi.fn()});
    expect(app.fetch).toHaveBeenCalledOnce();
    expect(app.navigate).toHaveBeenCalledExactlyOnceWith('/konto/?lang=pl');
  });
});
