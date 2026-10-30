import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = fileURLToPath(new URL('../src/lib/site-studio-contract.ts', import.meta.url));

test('the built browser contract follows the configured official or preview origin', async () => {
  const previous = process.env.KNABA_RELEASE_MODE;
  try {
    for (const [mode, origin, otherOrigin] of [
      ['official', 'https://knaba.de', 'https://kneba.vsp.rest'],
      ['customer-candidate', 'https://kneba.vsp.rest', 'https://knaba.de'],
    ]) {
      process.env.KNABA_RELEASE_MODE = mode;
      const config = (await import(new URL('../astro.config.mjs?client-origin=' + mode, import.meta.url))).default;
      assert.equal(config.site, origin);
      const result = await build({
        configFile: false,
        root,
        logLevel: 'silent',
        define: config.vite?.define,
        build: {
          write: false,
          minify: false,
          lib: { entry, formats: ['iife'], name: 'KnabaStudioContract', fileName: 'client-domain-contract' },
        },
      });
      const output = Array.isArray(result) ? result[0] : result;
      const chunk = output.output.find(item => item.type === 'chunk' && item.isEntry);
      assert.ok(chunk, 'the real shared contract must produce a browser module');
      // Use a browser-like global scope: Node's process.env must not mask a missing client define.
      const contract = runInNewContext(chunk.code + '\nKnabaStudioContract;', { URL }, { timeout: 1000 });
      const cases = [
        ['/kontakt/', true],
        [origin + '/kontakt/', true],
        [otherOrigin + '/kontakt/', false],
        ['https://example.com/kontakt/', false],
        ['//example.com/kontakt/', false],
        ['/\\\\example.com/kontakt/', false],
        [origin.replace('https://', 'https://user:password@') + '/kontakt/', false],
      ];
      for (const [value, expected] of cases) {
        assert.equal(contract.safeStudioHref(value), expected, mode + ': ' + value);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.KNABA_RELEASE_MODE;
    else process.env.KNABA_RELEASE_MODE = previous;
  }
});
