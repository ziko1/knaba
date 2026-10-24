import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sites } from './scripts/vite/sites-vite-plugin';

export default defineConfig({
  publicDir: '.astro-static',
  plugins: [sites({ mockAuth: false }), cloudflare({
    viteEnvironment: { name: 'server' },
    inspectorPort: false,
    config: {
      name: 'knaba-portal',
      main: './worker/index.ts',
      compatibility_date: '2026-05-15',
      compatibility_flags: ['nodejs_compat'],
      assets: { binding: 'ASSETS', html_handling: 'force-trailing-slash', not_found_handling: '404-page', run_worker_first: ['/', '/editor', '/editor/*', '/ru/*', '/en/*', '/uk/*', '/leistungen/*', '/ratgeber/*', '/kontakt/*', '/berlin/*', '/branchen/*', '/unternehmen/*', '/karriere/*', '/api/editor/*', '/api/crm/*', '/api/portal/*', '/api/leads', '/api/assistant/*'] },
      d1_databases: [{ binding: 'DB', database_name: 'knaba-preview-local', database_id: '00000000-0000-4000-8000-000000000000', migrations_dir:'../../drizzle' }],
    },
  })],
});
