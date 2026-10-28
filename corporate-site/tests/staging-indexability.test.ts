import {afterEach, expect, test, vi} from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test.each(['vsp', '', 'preview'])('%s build keeps staging out of search', async mode => {
  vi.stubEnv('KNABA_RELEASE_MODE', mode);
  vi.resetModules();
  const {siteConfig} = await import('../src/data/site');
  expect(siteConfig.origin).toBe('https://kneba.vsp.rest');
  expect(siteConfig.indexable).toBe(false);
});

test('only the isolated official build enables production indexability', async () => {
  vi.stubEnv('KNABA_RELEASE_MODE', 'official');
  vi.resetModules();
  const {siteConfig} = await import('../src/data/site');
  expect(siteConfig.origin).toBe('https://knaba.de');
  expect(siteConfig.indexable).toBe(true);
});
