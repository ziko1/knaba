import {IntegrationWebhookAdapter} from '../../packages/integrations/outbound-webhook.ts';
import {parseIntegrationCredentials} from '../../packages/integrations/generic-events.ts';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Database } from '../api/database.ts';
import { Engine } from '../api/engine.ts';
import { DeepSeekAdapter, WhatsAppCloudAdapter } from '../../packages/integrations/index.ts';
import { TelegramBotAdapter } from '../../packages/integrations/telegram.ts';
import { WorkerRunner, type WorkerOptions } from './runner.ts';

export function workerOptions(env:NodeJS.ProcessEnv=process.env):WorkerOptions {
  const companyId=env.COMPANY_ID??'knaba-demo';const appMode=env.APP_MODE??'DEMO';
  // Public menu links belong to the website; API/webhook origin stays separate.
  // Empty preserves legacy single-origin setups without enabling any provider.
  const websiteOrigin=env.BOT_WEBSITE_ORIGIN||undefined;
  if(websiteOrigin){
    let valid=false;
    try{const url=new URL(websiteOrigin);valid=url.protocol==='https:'&&Boolean(url.hostname)&&
      !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&!url.hostname.endsWith('.invalid');}
    catch{ /* Never echo credentials from an invalid URL. */ }
    if(!valid)throw new Error('BOT_WEBSITE_ORIGIN_INVALID');
  }
  const options:WorkerOptions={companyId,appMode,publicOrigin:websiteOrigin??env.PUBLIC_ORIGIN,batchSize:5,leaseMs:120000,maxAttempts:4,testRecipients:(env.WHATSAPP_TEST_RECIPIENTS??'').split(',').map(s=>s.replace(/[^\d]/g,'')).filter(Boolean)};
  if(env.DEEPSEEK_API_KEY&&env.DEEPSEEK_BASE_URL&&env.DEEPSEEK_REGION)options.ai=new DeepSeekAdapter({baseUrl:env.DEEPSEEK_BASE_URL,apiKey:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL??'deepseek-chat',timeoutMs:15000,privacyApprovalId:env.AI_TRANSFER_APPROVAL_ID,region:env.DEEPSEEK_REGION,inputPricePerMillionCents:Number(env.AI_INPUT_PRICE_PER_MILLION_CENTS??100),outputPricePerMillionCents:Number(env.AI_OUTPUT_PRICE_PER_MILLION_CENTS??200),maxOutputTokens:2000,syntheticOnly:env.AI_SYNTHETIC_ONLY==='true'});
  if(env.LIVE_SEND_ALLOWED==='true'&&env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.WHATSAPP_API_VERSION&&env.WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED==='true'){options.whatsappCapabilities={accountVerified:true,buttons:env.WHATSAPP_BUTTONS_VERIFIED==='true',lists:env.WHATSAPP_LISTS_VERIFIED==='true'};options.whatsapp=new WhatsAppCloudAdapter({accessToken:env.WHATSAPP_ACCESS_TOKEN,phoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID,apiVersion:env.WHATSAPP_API_VERSION,accountCapabilitiesVerified:true});}
  // Telegram was implemented as an adapter but previously never wired into the
  // running worker. Keep this an explicit, separate, fail-closed opt-in.
  if(env.LIVE_SEND_ALLOWED==='true'&&env.TELEGRAM_LIVE_SEND_ALLOWED==='true'){
    const recipients=(env.TELEGRAM_ALLOWED_CHAT_IDS??'').split(',').map(id=>id.trim());
    const version=env.TELEGRAM_APPROVED_CONSENT_VERSION;
    let validOrigin=false;
    try {
      const url=new URL(env.PUBLIC_ORIGIN??'');
      validOrigin=url.protocol==='https:'&&Boolean(url.hostname)&&!url.username&&!url.password&&
        !url.search&&!url.hash&&url.pathname==='/'&&!url.hostname.endsWith('.invalid');
    } catch { /* Do not echo an invalid origin or any provider credential. */ }
    if(!env.TELEGRAM_BOT_TOKEN||!version||!(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(version))||
       !validOrigin||!recipients.length||recipients.some(id=>!(/^[1-9]\d{0,15}$/.test(id)))||
       new Set(recipients).size!==recipients.length){
      throw new Error('TELEGRAM_OUTBOUND_CONFIGURATION_MISSING');
    }
    options.telegram=new TelegramBotAdapter({
      token:env.TELEGRAM_BOT_TOKEN,enabled:true,allowedChatIds:recipients,timeoutMs:15000
    });
    options.telegramApprovedConsentVersion=version;
  }
  // Inbound credentials alone never activate outbound delivery.
  const credentials=parseIntegrationCredentials(env.INTEGRATION_CREDENTIALS_JSON);
  if(env.LIVE_INTEGRATION_SEND_ALLOWED==='true'&&credentials.length)options.integrationWebhook=new IntegrationWebhookAdapter(credentials,{liveSendAllowed:true});
  return options;
}
export async function startWorker(database?:Database,engine?:Engine,options=workerOptions()) {
  const ownDatabase=!database;const db=database??new Database();const runtime=engine??new Engine(db,options.appMode);const runner=new WorkerRunner(db,runtime,options);await runner.initialize();let stopping=false;let loop:Promise<unknown>|undefined;
  const tick=()=>{if(stopping||loop)return;loop=runner.tick().then(async()=>{await writeFile(process.env.WORKER_HEARTBEAT_FILE??'/tmp/knaba-worker-heartbeat',String(Date.now()),{mode:0o600});}).catch(()=>{process.stderr.write('KNABA DE worker cycle failed\n');}).finally(()=>{loop=undefined;});};tick();const timer=setInterval(tick,1000);const stop=async()=>{if(stopping)return;stopping=true;clearInterval(timer);runner.stop();await loop;if(ownDatabase)await db.close();};return {runner,stop};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const worker=await startWorker();for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void worker.stop().then(()=>process.exit(0));});process.stdout.write('KNABA DE durable worker started\n');}
