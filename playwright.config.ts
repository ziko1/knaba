import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';

export default defineConfig({
 captureGitInfo:{commit:true,diff:false},
 testDir:'./tests',testMatch:['browser.spec.ts','web-session-races.spec.ts'],fullyParallel:false,workers:1,retries:0,timeout:45_000,
 expect:{timeout:12_000},outputDir:'docs/evidence/browser-artifacts',
 reporter:[['list'],['json',{outputFile:'docs/evidence/browser-result.json'}],['html',{outputFolder:'docs/evidence/browser-report',open:'never'}]],
 use:{baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:3000',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure',video:'off',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--disable-dev-shm-usage']}},
});
