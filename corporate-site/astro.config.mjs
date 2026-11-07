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
  // ServiceFinder and the Astro adapter use setup/render; omit the unused Vue options runtime.
  integrations: [solid(), vue({ appEntrypoint: '/src/vue-app', features: { optionsAPI: false } }), svelte()],
  vite: {
    // Expose only the release mode; browser code must use the same origin as generated pages.
    define: { 'import.meta.env.KNABA_RELEASE_MODE': JSON.stringify(officialRelease ? 'official' : 'preview') },
    plugins: [tailwindcss()],
    // The single Vue island always uses Vue and Pinia together. Share one
    // compressed runtime instead of several independently compressed fragments.
    environments: { client: { build: { rolldownOptions: { output: {
      codeSplitting: { groups: [
        { name: 'vue-runtime', test: /node_modules[\\/](?:@vue[\\/]|vue[\\/]|pinia[\\/])/ },
        // Every Solid island uses both reactivity and DOM; helpers stay lazy.
        { name: 'solid-runtime', test: /node_modules[\\/]solid-js[\\/](?:dist[\\/]|web[\\/]dist[\\/])/ },
        // Public form/catalogue consumers already use both pure data modules.
        { name: 'public-offer-copy', test: /src[\\/](?:lib[\\/]public-i18n|data[\\/]construction-offers)\.ts$/ },
      ] },
    } } } } },
    server: { allowedHosts: ['terminal.local'] },
    // Reuse the conservative public-style optimizer alongside the release-origin contract.
    css: { lightningcss: { unusedSymbols: findUnusedLegacyStyleSymbols() } },
  },
  devToolbar: { enabled: false },
});
