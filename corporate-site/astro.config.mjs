import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import vue from '@astrojs/vue';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { findUnusedLegacyStyleSymbols } from './scripts/legacy-css-budget.mjs';

export default defineConfig({
  site: process.env.KNABA_RELEASE_MODE === 'official' ? 'https://knaba.de' : 'https://kneba.vsp.rest',
  output: 'static',
  outDir: './.astro-static',
  trailingSlash: 'always',
  integrations: [solid(), vue({ appEntrypoint: '/src/vue-app' }), svelte()],
  vite: {
    plugins: [tailwindcss()], server: { allowedHosts: ['terminal.local'] },
    // Reuse PR115's conservative optimizer without restoring PR114's removed legacy rules.
    css: { lightningcss: { unusedSymbols: findUnusedLegacyStyleSymbols() } },
  },
  devToolbar: { enabled: false },
});
