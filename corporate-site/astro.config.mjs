import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import vue from '@astrojs/vue';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://kneba.vsp.rest',
  output: 'static',
  trailingSlash: 'always',
  integrations: [solid(), vue({ appEntrypoint: '/src/vue-app' }), svelte()],
  vite: { plugins: [tailwindcss()], server: { allowedHosts: ['terminal.local'] } },
  devToolbar: { enabled: false },
});
