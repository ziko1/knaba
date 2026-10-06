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
if(mode==='PRODUCTION'){if(!process.env.COMPANY_ID||company==='knaba-demo'||company==='knaba-de-demo')failures.push('PRODUCTION requires the explicitly verified COMPANY_ID');if(process.env.AI_SYNTHETIC_ONLY==='true')console.log('NOT_RUN: real AI transfer remains disabled by AI_SYNTHETIC_ONLY.');}
if(process.env.WIDGET_ALLOWED_ORIGINS){for(const origin of process.env.WIDGET_ALLOWED_ORIGINS.split(',').filter(Boolean)){try{const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')failures.push('WIDGET_ALLOWED_ORIGINS contains an invalid origin');}catch{failures.push('WIDGET_ALLOWED_ORIGINS contains an invalid origin');}}}
if(process.env.LIVE_SEND_ALLOWED==='true'){for(const name of ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION'])requireValue(name);if(process.env.WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED!=='true')failures.push('LIVE_SEND_ALLOWED requires verified WhatsApp account capabilities');console.log('NOT_RUN: LIVE_SEND_ALLOWED does not replace recipient, template or deployment authorization.');}
if(failures.length){for(const item of failures)console.error(`FAILED: ${item}`);process.exitCode=1;}else console.log(`PASSED: ${mode} runtime configuration and strict TLS checks (secret values hidden).`);
