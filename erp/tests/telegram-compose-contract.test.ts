import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const compose=readFileSync(new URL('../infra/compose.yml',import.meta.url),'utf8');

describe('Telegram Docker Compose runtime contract',()=>{
  it('passes every Telegram inbound/outbound gate into API and worker runtime',()=>{
    for(const key of [
      'TELEGRAM_WEBHOOK_SECRET','TELEGRAM_LIVE_SEND_ALLOWED','TELEGRAM_BOT_TOKEN',
      'TELEGRAM_APPROVED_CONSENT_VERSION','TELEGRAM_ALLOWED_CHAT_IDS'
    ]) expect(compose).toContain(key+': ${'+key+':-}');
  });
});
