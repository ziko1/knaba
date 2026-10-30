const mode=process.env.APP_MODE||'DEMO';
const failures=[];
const requireValue=key=>{const value=process.env[key];if(!value||/^REPLACE_|^CHANGE_ME|^<.+>$/.test(value))failures.push(`Missing valid ${key}`);return value;};
if(!['DEMO','TEST','PRODUCTION'].includes(mode))failures.push('APP_MODE must be DEMO, TEST or PRODUCTION');
if(Number(process.versions.node.split('.')[0])!==24)failures.push('Node 24 is required');
if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||/^(false|0)$/i.test(process.env.NPM_CONFIG_STRICT_SSL||'')||/^(false|0)$/i.test(process.env.npm_config_strict_ssl||''))failures.push('TLS certificate verification must remain enabled');
const database=requireValue('DATABASE_URL');
if(database){try{const url=new URL(database);if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname||url.pathname==='/')failures.push('DATABASE_URL must identify a PostgreSQL host/database');}catch{failures.push('DATABASE_URL is invalid');}}
const company=process.env.COMPANY_ID||'knaba-demo';
if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(company))failures.push('COMPANY_ID must be a bounded stable identifier');
const key=requireValue('AUTH_ENCRYPTION_KEY');
if(key&&key.length<32)failures.push('AUTH_ENCRYPTION_KEY must contain at least 32 characters');
const sha=requireValue('GIT_SHA');
if(sha&&(!/^[a-f0-9]{40}$/.test(sha)||/^0{40}$/.test(sha)))failures.push('GIT_SHA must be the exact non-placeholder 40-character release SHA');
const origin=requireValue('PUBLIC_ORIGIN');
if(origin){try{const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')failures.push('PUBLIC_ORIGIN must be an HTTP(S) origin without credentials/path/query');if(mode==='PRODUCTION'&&url.protocol!=='https:')failures.push('PRODUCTION requires HTTPS PUBLIC_ORIGIN');}catch{failures.push('PUBLIC_ORIGIN is invalid');}}
const websiteOrigin=process.env.BOT_WEBSITE_ORIGIN;
if(websiteOrigin){try{const url=new URL(websiteOrigin);if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.hostname.endsWith('.invalid'))failures.push('BOT_WEBSITE_ORIGIN must be an HTTPS website origin without credentials/path/query');}catch{failures.push('BOT_WEBSITE_ORIGIN is invalid');}}
if(mode==='PRODUCTION'){if(!process.env.COMPANY_ID||company==='knaba-demo'||company==='knaba-de-demo')failures.push('PRODUCTION requires the explicitly verified COMPANY_ID');if(process.env.AI_SYNTHETIC_ONLY==='true')console.log('NOT_RUN: real AI transfer remains disabled by AI_SYNTHETIC_ONLY.');}
if(process.env.WIDGET_ALLOWED_ORIGINS){for(const origin of process.env.WIDGET_ALLOWED_ORIGINS.split(',').filter(Boolean)){try{const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')failures.push('WIDGET_ALLOWED_ORIGINS contains an invalid origin');}catch{failures.push('WIDGET_ALLOWED_ORIGINS contains an invalid origin');}}}
const telegramSend=process.env.TELEGRAM_LIVE_SEND_ALLOWED==='true';
if(telegramSend&&process.env.LIVE_SEND_ALLOWED!=='true')failures.push('TELEGRAM_LIVE_SEND_ALLOWED requires global LIVE_SEND_ALLOWED');
if(process.env.LIVE_SEND_ALLOWED==='true'){
  // Telegram-only deployments must not need unrelated Meta credentials.
  // Keep the original WhatsApp-only preflight unchanged when Telegram is OFF.
  const whatsappConfigured=['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION'].some(name=>Boolean(process.env[name]))||process.env.WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED==='true';
  if(!telegramSend||whatsappConfigured){
    for(const name of ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION'])requireValue(name);
    if(process.env.WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED!=='true')failures.push('LIVE_SEND_ALLOWED requires verified WhatsApp account capabilities');
  }
  if(telegramSend){
    requireValue('TELEGRAM_BOT_TOKEN');
    const version=requireValue('TELEGRAM_APPROVED_CONSENT_VERSION');
    if(version&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(version))failures.push('Invalid TELEGRAM_APPROVED_CONSENT_VERSION');
    const raw=requireValue('TELEGRAM_ALLOWED_CHAT_IDS');
    const ids=(raw??'').split(',').map(value=>value.trim());
    if(!raw||ids.some(id=>!/^[1-9]\d{0,15}$/.test(id))||new Set(ids).size!==ids.length)failures.push('Invalid TELEGRAM_ALLOWED_CHAT_IDS');
    if(!origin||!origin.startsWith('https://'))failures.push('Telegram outbound requires HTTPS PUBLIC_ORIGIN');
  }
  console.log('NOT_RUN: enabled provider flags do not replace legal consent, scoped authorization, quota or live delivery UAT.');
}
if(failures.length){for(const item of failures)console.error(`FAILED: ${item}`);process.exitCode=1;}else console.log(`PASSED: ${mode} runtime configuration and strict TLS checks (secret values hidden).`);
