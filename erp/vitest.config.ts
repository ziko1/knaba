import {defineConfig} from 'vitest/config';

export default defineConfig({test:{include:['tests/**/*.test.ts','apps/web/src/**/*.test.ts'],exclude:['tests/browser.spec.ts'],testTimeout:30_000,hookTimeout:30_000,reporters:['default']}});
