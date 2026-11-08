import {afterEach,describe,expect,it,vi} from 'vitest';
import {parseWhatsAppWebhook} from '../packages/integrations/whatsapp.ts';
import {transferEnvelope,transferFixture,transferHttp,transferPhone,syntheticPhoneId} from './helpers/conversation-transfer-fixture.ts';

afterEach(()=>vi.unstubAllEnvs());
describe('ERP guest conversation transfer regression',()=>{
 it('reserves and hashes the WhatsApp transfer code before any inbox/history persistence',()=>{
  const secret='A'.repeat(43),id='24bb970d-5db5-4c89-a642-57c52d35059e';
  const events=parseWhatsAppWebhook(transferEnvelope(`KNABA_TRANSFER ${id}.${secret}`));
  expect(JSON.stringify(events)).not.toContain(secret);
  expect(events).toMatchObject([{kind:'MESSAGE',type:'transfer',transfer:{state:'CLAIM',id,tokenHash:expect.stringMatching(/^[a-f0-9]{64}$/)}}]);
 });
 it('issues a one-shot 10-minute transfer from the actual guest HTTP route',async()=>{
  vi.stubEnv('WHATSAPP_PUBLIC_NUMBER',transferPhone);vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID',syntheticPhoneId);const f=transferFixture(),server=await transferHttp(f);
  try{const response=await server.request('',{});expect(response.status).toBe(201);const value=await response.json();expect(value).toMatchObject({state:'ISSUED',channelId:'guest-channel',url:expect.stringContaining(`https://wa.me/${transferPhone}?text=`)});expect(Date.parse(value.expiresAt)-Date.now()).toBeGreaterThan(590000);expect(response.headers.get('cache-control')).toContain('no-store');}
  finally{await server.app.close();}
 });
});
