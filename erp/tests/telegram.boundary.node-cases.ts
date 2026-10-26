import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyTelegramWebhookSecret,parseTelegramUpdate,TelegramBotAdapter,TelegramBoundaryError} from '../packages/integrations/telegram.ts';
const secret = 'the_secret_for_synthetic_test_2026';
const message = (body: unknown = 'Hallo', from = 123456789) => ({
  update_id: 271, message: {message_id: 71, date: 1792000000, chat: {type:'private', id: from}, from: {id: from, is_bot: false}, text: body}
});
const error = (code: string) => (e: unknown) => e instanceof TelegramBoundaryError && e.code === code;

test('shared Telegram webhook secret header: missing, wrong, malformed or disabled fail closed', () => {
  assert.equal(verifyTelegramWebhookSecret(secret,secret), true);
  for(const bad of ['', 'other', secret.slice(1), ['abc'], undefined, 'a'.repeat(257)])
    assert.throws(()=>verifyTelegramWebhookSecret(bad, secret), error('ACCESS_DENIED'));
  assert.throws(()=>verifyTelegramWebhookSecret(secret, undefined), error('MISSING_CONFIGURATION'));
});

test('text private update maps to stable provider event and untrusted sender identity', () => {
  assert.deepEqual(parseTelegramUpdate(message()), {
    kind:'MESSAGE', id:'TELEGRAM:271', update_id:271, sender:'123456789', chat_id:'123456789',
    received_at: new Date(1792000000*1000).toISOString(), type:'text',text:'Hallo'
  });
});

test('no group/channel or out-of-scope bot/service updates', () => {
  const m = message() as any;
  m.message.chat.type = 'group'; m.message.chat.id=-12222;
  assert.equal(parseTelegramUpdate(m),null);
  assert.equal(parseTelegramUpdate({update_id:1, channel_post:{message_id:10}}), null);
  assert.equal(parseTelegramUpdate({update_id:2, edited_message:m.message}),null);
});

test('private ID spoof and malformed update are rejected rather than granted access', () => {
  const m = message() as any;m.message.from.id=2222;
  assert.throws(()=>parseTelegramUpdate(m),error('ACCESS_DENIED'));
  assert.throws(()=>parseTelegramUpdate({update_id:2,message:{chat:{type:'private',id:1}}}),error('ACCESS_DENIED'));
  assert.throws(()=>parseTelegramUpdate({update_id:1.5,message:{}}),error('VALIDATION_ERROR'));
  assert.throws(()=>parseTelegramUpdate(message('x'.repeat(4097))),error('VALIDATION_ERROR'));
});

test('voice/photo/attachments are classified for manual media quarantine, not treated as text', () => {
  const m=message() as any;delete m.message.text;
  m.message.voice={file_id:'opaque_abc-123'};
  assert.deepEqual(parseTelegramUpdate(m)?.media,{kind:'voice',file_id:'opaque_abc-123'});
  delete m.message.voice;m.message.photo=[{file_id:'small'},{file_id:'largest'}];
  assert.deepEqual(parseTelegramUpdate(m)?.media,{kind:'photo',file_id:'largest'});
});

test('private callback is advisory metadata, not a confirmed ERP command',()=>{
  const m=message() as any;
  assert.deepEqual(parseTelegramUpdate({update_id:100,callback_query:{from:{id:123456789},data:'approve_foreign',message:m.message}}), {
    kind:'MESSAGE',id:'TELEGRAM:100',update_id:100,sender:'123456789',chat_id:'123456789',
    received_at: new Date(1792000000*1000).toISOString(),type:'callback',action_id:'approve_foreign'
  });
});

test('outbound disabled/consent/allowlist paths never make an HTTP request', async () => {
  let called=0;
  const fake = async():Promise<Response> => {called++;return new Response('{}')};
  const config={token:'123456:ABCDEFghijk1234567890_ABCDEFghijk',enabled:false,allowedChatIds:['123456789']};
  const policy={consent:true,verifiedPrivateRecipient:true};
  const no=new TelegramBotAdapter(config,fake as typeof fetch);
  await assert.rejects(no.sendText('123456789','Hi',policy),error('PROVIDER_DISABLED'));
  const yes = new TelegramBotAdapter({...config,enabled:true},fake as typeof fetch);
  await assert.rejects(yes.sendText('123456789','Hi',{...policy,consent:false}),error('ACCESS_DENIED'));
  await assert.rejects(yes.sendText('987654321','Hi',policy),error('ACCESS_DENIED'));
  await assert.rejects(yes.sendText('123456789','Hi',{...policy,verifiedPrivateRecipient:false}),error('ACCESS_DENIED'));
  assert.equal(called,0);
});

test('mock outbound distinguishes provider acceptance from delivery and unknown timeout', async () => {
  const config={token:'123456:ABCDEFghijk1234567890_ABCDEFghijk',enabled:true,allowedChatIds:['123456789']};
  const policy={consent:true,verifiedPrivateRecipient:true};
  const ok=new TelegramBotAdapter(config,(async (_url,opts) => {
    const body=JSON.parse(String(opts?.body));assert.equal(body.chat_id,'123456789');assert.deepEqual(body.link_preview_options,{is_disabled:true});
    return new Response(JSON.stringify({ok:true,result:{message_id:78,chat:{id:123456789}}}));
  }) as typeof fetch);
  assert.deepEqual(await ok.sendText('123456789','Original',policy),{provider_message_id:'78',status:'API_ACCEPTED'});
  const crash=new TelegramBotAdapter(config,(async()=>{throw new Error('timeout')}) as typeof fetch);
  await assert.rejects(crash.sendText('123456789','Original',policy),error('PROVIDER_OUTCOME_UNKNOWN'));
});
