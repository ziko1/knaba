import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';

const script=fileURLToPath(new URL('../scripts/environment-check.mjs',import.meta.url));
const fakeToken='123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const base:NodeJS.ProcessEnv={
  APP_MODE:'TEST',DATABASE_URL:'postgresql://synthetic:synthetic@localhost:5432/knaba_qa',
  COMPANY_ID:'knaba-qa',AUTH_ENCRYPTION_KEY:'SYNTHETIC_ENCRYPTION_KEY_FOR_CI_ONLY_32',
  GIT_SHA:'b'.repeat(40),PUBLIC_ORIGIN:'https://kneba.vsp.rest/',
  LIVE_SEND_ALLOWED:'false',TELEGRAM_LIVE_SEND_ALLOWED:'false',
  WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED:'false'
};
function verify(settings:NodeJS.ProcessEnv={}){
  return spawnSync(process.execPath,[script],{
    env:{...base,...settings},encoding:'utf8',timeout:10000
  });
}
const telegramOnly:NodeJS.ProcessEnv={
  LIVE_SEND_ALLOWED:'true',TELEGRAM_LIVE_SEND_ALLOWED:'true',
  TELEGRAM_BOT_TOKEN:fakeToken,TELEGRAM_ALLOWED_CHAT_IDS:'187650211',
  TELEGRAM_APPROVED_CONSENT_VERSION:'TEST_ONLY_NOTICE_2026'
};

describe('preflight accepts explicit Telegram-only mode and denies broken channel setups',()=>{
  it('keeps all outbound disabled by default',()=>{
    const run=verify();
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('PASSED: TEST runtime configuration');
  });
  it('allows Telegram-only opt-in without unrelated WhatsApp tokens',()=>{
    const run=verify(telegramOnly);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('NOT_RUN: enabled provider flags');
    expect(run.stdout+run.stderr).not.toContain(fakeToken);
  });
  it('accepts distinct website and ERP roots and keeps the single-origin fallback',()=>{
    for(const BOT_WEBSITE_ORIGIN of ['https://site.example.test/','',undefined]){
      const run=verify({...telegramOnly,PUBLIC_ORIGIN:'https://erp.example.test/',BOT_WEBSITE_ORIGIN});
      expect(run.status).toBe(0);
    }
    expect(verify({...telegramOnly,PUBLIC_ORIGIN:'http://erp.example.test/',BOT_WEBSITE_ORIGIN:'https://site.example.test/'}).status).toBe(1);
  });
  it('rejects malformed website roots even while sending is disabled, without echoing URL secrets',()=>{
    for(const BOT_WEBSITE_ORIGIN of ['http://site.example.test/','https://test:private-value@site.example.test/',
      'https://site.example.test/contact/','https://site.example.test/?token=private-value',
      'https://site.example.test/#fragment','https://site.example.invalid/','not-a-url']){
      const run=verify({BOT_WEBSITE_ORIGIN});
      expect(run.status).toBe(1);expect(run.stderr).toContain('BOT_WEBSITE_ORIGIN');
      expect(run.stdout+run.stderr).not.toContain('private-value');
    }
  });
  it('preserves legacy WhatsApp-only fail closed when global send is enabled',()=>{
    const run=verify({LIVE_SEND_ALLOWED:'true'});
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('WHATSAPP_ACCESS_TOKEN');
  });
  it('rejects Telegram request without the global authorization fence',()=>{
    const run=verify({...telegramOnly,LIVE_SEND_ALLOWED:'false'});
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('TELEGRAM_LIVE_SEND_ALLOWED requires');
  });
  it('rejects incomplete opt-in, invalid recipients and an insecure origin',()=>{
    for(const override of [
      {TELEGRAM_BOT_TOKEN:undefined},
      {TELEGRAM_ALLOWED_CHAT_IDS:'187650211,187650211'},
      {TELEGRAM_APPROVED_CONSENT_VERSION:'../../../fake'},
      {PUBLIC_ORIGIN:'http://kneba.vsp.rest/'}
    ]){
      const run=verify({...telegramOnly,...override});
      expect(run.status).toBe(1);
    }
  });
});
