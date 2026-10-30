/** Customer walkthrough of executable message boundaries. NEVER contacts a provider or database. */
import {createHmac} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {telegramPublicIntent,telegramPublicReply} from '../packages/integrations/telegram-public-navigation.ts';
import {parseRouterCommand} from '../packages/integrations/whatsapp-router-text.ts';
import {verifyWhatsAppSignature,parseWhatsAppWebhook,renderWhatsAppMessage} from '../packages/integrations/whatsapp.ts';
import type {SupportedLanguage} from '../packages/integrations/deepseek.ts';

const origin='https://kneba.vsp.rest/';
const locales=['DE','EN','PL','LT','RU','UK'] as const satisfies readonly SupportedLanguage[];
const telegramCommands=['/start','/services','/request','/register','/call','/human'] as const;
const whatsappCommands=['/MENU','/MODULES','/AUTOMATIONS','/REGISTER','/HELP'] as const;

/** Output is derived from actual production classifiers/formatters, not a separate fake bot implementation. */
export function buildBotChannelVerification():string {
  const syntheticSecret='SYNTHETIC_SECURITY_CHECK_SECRET_NOT_A_PROVIDER_CREDENTIAL';
  const envelope={
    object:'whatsapp_business_account',
    entry:[{id:'synthetic-account',changes:[{field:'messages',value:{
      messaging_product:'whatsapp',metadata:{phone_number_id:'100000000000000'},
      messages:[{id:'synthetic-inbound-1',from:'491111111111',
        timestamp:'1790000000',type:'text',text:{body:'/MENU'}}]
    }}]}]
  };
  const raw=Buffer.from(JSON.stringify(envelope));
  const signature='sha256='+createHmac('sha256',syntheticSecret).update(raw).digest('hex');
  const verified=verifyWhatsAppSignature(raw,signature,syntheticSecret);
  const messages=parseWhatsAppWebhook(envelope);
  if(!verified||messages.length!==1||messages[0]?.kind!=='MESSAGE')
    throw Error('OFFLINE_WHATSAPP_SAMPLE_INVALID');
  const outboundPayload=renderWhatsAppMessage('491111111111',{
    kind:'TEXT',text:'KNABA: Demo-Antwort — Anfrage wird durch das Team geprüft.'
  });
  const output=[
    'KNABA DE | WhatsApp + Telegram | OFFLINE CHANNEL VERIFICATION',
    '=========================================================',
    'STATUS: PROTOCOL / PUBLIC INTENT SIMULATION ONLY',
    'Provider calls: 0 | Real messages: 0 | Database writes: 0',
    'Real delivery, consent, owner handoff, voice calls and ERP integration: NOT_RUN',
    '',
    'WHATSAPP — signed synthetic inbound through real verification and parser:',
    '  HMAC verification: PASS (synthetic secret and payload)',
    `  Inbound type: ${messages[0].type}; command: ${parseRouterCommand(messages[0].text??'')?.command??'UNRECOGNIZED'}`,
    '  Canonical command recognizer (authorization / execution NOT simulated):'
  ];
  for(const command of whatsappCommands){
    const match=parseRouterCommand(command);
    if(!match)throw Error('DEMO_WHATSAPP_COMMAND_UNKNOWN');
    output.push(`    ${command} => ${match.command}`);
  }
  output.push('  WhatsApp Cloud API outbound payload renderer (NOT SENT):',
    '    '+JSON.stringify(outboundPayload),
    '',
    'TELEGRAM — real guest-only public intent classifier and localized response renderer:');
  for(const command of telegramCommands){
    const intent=telegramPublicIntent(command);
    if(!intent)throw Error('DEMO_TELEGRAM_COMMAND_UNKNOWN');
    output.push(`  ${command} => ${intent}`);
    for(const locale of locales){
      const response=telegramPublicReply(intent,locale,origin);
      output.push(`    [${locale}] ${response.replaceAll('\n',' | ')}`);
    }
  }
  output.push(
    '',
    'SECURITY BOUNDARIES:',
    '  /approve and /grant OWNER are not Telegram public commands.',
    '  /stop is an opt-out handled by the durable worker (not exercised here).',
    '  A Telegram/WhatsApp sender ID alone is never an ERP owner login.',
    '  No accounts, permissions, CRM entries or live provider events were created.',
    '  Real provider delivery requires approved credentials, legal consent, owner UAT and release checks.'
  );
  return output.join('\n')+'\n';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  process.stdout.write(buildBotChannelVerification());
