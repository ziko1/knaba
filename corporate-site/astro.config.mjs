import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import vue from '@astrojs/vue';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { findUnusedLegacyStyleSymbols } from './scripts/legacy-css-budget.mjs';

const officialRelease = process.env.KNABA_RELEASE_MODE === 'official';

export default defineConfig({
  site: officialRelease ? 'https://knaba.de' : 'https://kneba.vsp.rest',
  output: 'static',
  outDir: './.astro-static',
  trailingSlash: 'always',
  integrations: [solid(), vue({ appEntrypoint: '/src/vue-app' }), svelte()],
  vite: {
    // Expose only the release mode; browser code must use the same origin as generated pages.
    define: { 'import.meta.env.KNABA_RELEASE_MODE': JSON.stringify(officialRelease ? 'official' : 'preview') },
    plugins: [tailwindcss()],
    server: { allowedHosts: ['terminal.local'] },
    // Reuse the conservative public-style optimizer alongside the release-origin contract.
    css: { lightningcss: { unusedSymbols: findUnusedLegacyStyleSymbols() } },
  },
  devToolbar: { enabled: false },
});
