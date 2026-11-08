/** Opt-in account mail. No persistent bearer-token outbox, retries or live defaults. */
import {normalizeEmail} from './auth.mjs';

const endpoint='https://api.resend.com/emails';
const locales=['de','en','pl','lt','ru','uk'];
const timeoutMs=5000;
const maxResponseBytes=8192;
const maxInFlight=4;
const words={
  de:{reset:'KnaBa: Passwort zurücksetzen',change:'KnaBa: neue E-Mail-Adresse bestätigen',resetIntro:'Mit diesem persönlichen Link können Sie ein neues Passwort festlegen.',changeIntro:'Bestätigen Sie mit diesem persönlichen Link die neue E-Mail-Adresse Ihres KNABA-Kontos.',expiry:'Der Link ist einmalig und 30 Minuten gültig. Wenn Sie dies nicht angefordert haben, ignorieren Sie diese Nachricht. Geben Sie den Link und Ihr Passwort niemals weiter.'},
  en:{reset:'KnaBa: reset your password',change:'KnaBa: confirm your new email address',resetIntro:'Use this personal link to choose a new password.',changeIntro:'Use this personal link to confirm the new email address for your KNABA account.',expiry:'This link can be used once and expires in 30 minutes. If you did not request this, ignore this message. Never share the link or your password.'},
  pl:{reset:'KnaBa: zresetuj hasło',change:'KnaBa: potwierdź nowy adres e-mail',resetIntro:'Użyj tego osobistego linku, aby ustawić nowe hasło.',changeIntro:'Potwierdź nowy adres e-mail konta KNABA za pomocą tego osobistego linku.',expiry:'Link jest jednorazowy i ważny przez 30 minut. Jeśli nie wysłano tej prośby, zignoruj wiadomość. Nigdy nie udostępniaj linku ani hasła.'},
  lt:{reset:'KnaBa: atkurkite slaptažodį',change:'KnaBa: patvirtinkite naują el. pašto adresą',resetIntro:'Naudodami šią asmeninę nuorodą nustatykite naują slaptažodį.',changeIntro:'Šia asmenine nuoroda patvirtinkite naują KNABA paskyros el. pašto adresą.',expiry:'Nuoroda vienkartinė ir galioja 30 minučių. Jei to neprašėte, ignoruokite šį laišką. Niekada nesidalykite nuoroda ar slaptažodžiu.'},
  ru:{reset:'KnaBa: восстановление пароля',change:'KnaBa: подтверждение нового email',resetIntro:'Перейдите по личной ссылке, чтобы установить новый пароль.',changeIntro:'Подтвердите новый email вашей учётной записи KNABA по личной ссылке.',expiry:'Ссылка одноразовая и действует 30 минут. Если вы не отправляли запрос, проигнорируйте письмо. Никому не передавайте ссылку или пароль.'},
  uk:{reset:'KnaBa: відновлення пароля',change:'KnaBa: підтвердження нового email',resetIntro:'За цим особистим посиланням можна встановити новий пароль.',changeIntro:'Підтвердьте новий email вашого облікового запису KNABA за особистим посиланням.',expiry:'Посилання одноразове й діє 30 хвилин. Якщо ви не надсилали запит, проігноруйте лист. Нікому не передавайте посилання чи пароль.'}
};

function configuration(environment,origin){
  if(environment.KNABA_ACCOUNT_EMAIL_ENABLED!=='approved')return null;
  const apiKey=environment.RESEND_API_KEY;
  if(typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>4096||/[\r\n]/.test(apiKey))return null;
  const from=environment.KNABA_ACCOUNT_EMAIL_FROM;
  if(typeof from!=='string'||from.length>400||/[\r\n]/.test(from))return null;
  const address=from.match(/^(?:[^<>\r\n]{1,80} <)?([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>?$/)?.[1];
  try{if(!address||normalizeEmail(address)!==address.toLowerCase())return null;}catch{return null;}
  const dailyLimit=Number(environment.KNABA_ACCOUNT_EMAIL_DAILY_LIMIT);
  if(!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>100)return null;
  try{
    const target=new URL(origin);
    if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)return null;
    return {apiKey,from,dailyLimit,origin:target.origin};
  }catch{return null;}
}

async function receipt(response){
  if(!response?.body||typeof response.body.getReader!=='function')return false;
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxResponseBytes)){
    await response.body.cancel().catch(()=>{});return false;
  }
  const reader=response.body.getReader();
  let total=0;
  const chunks=[];
  try{
    while(true){
      const part=await reader.read();
      if(part.done)break;
      total+=part.value.byteLength;
      if(total>maxResponseBytes){await reader.cancel();return false;}
      chunks.push(part.value);
    }
    const data=JSON.parse(Buffer.concat(chunks,total).toString('utf8'));
    return typeof data?.id==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(data.id);
  }catch{return false;}
  finally{reader.releaseLock();}
}

/** All arguments are server-owned. An injected transport is a test seam, not a URL override. */
export function createAccountMailer({environment=process.env,transport=fetch,origin}={}){
  let closed=false;
  const jobs=new Set(),sends=new Set();
  const config=()=>closed?null:configuration(environment,origin);
  const drain=async()=>{
    while(jobs.size||sends.size)await Promise.allSettled([...jobs,...sends]);
  };
  return {
    get enabled(){return config()!==null;},
    get dailyLimit(){return config()?.dailyLimit??0;},
    /** Public recovery responds after this bounded reservation, never after provider I/O. */
    schedule(work){
      if(typeof work!=='function'||!config()||jobs.size>=maxInFlight)return false;
      let finish;
      const job=new Promise(resolve=>{finish=resolve;});
      jobs.add(job);
      setImmediate(()=>{
        Promise.resolve().then(()=>closed?undefined:work()).catch(()=>{
          // The caller keeps its generic public response; no secrets/provider errors are logged.
        }).finally(()=>{jobs.delete(job);finish();});
      });
      return true;
    },
    async send({kind,email,token,locale='de',idempotencyKey}={}){
      const current=config();
      if(!current)return {status:'disabled'};
      if(sends.size>=maxInFlight)return {status:'failed'};
      if(!['password_reset','email_change'].includes(kind)||
         typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||
         typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)||
         !locales.includes(locale))return {status:'failed'};
      let address;
      try{address=normalizeEmail(email);}catch{return {status:'failed'};}
      const url=new URL(kind==='password_reset'?'/reset-password/':'/account/email/confirm/',current.origin);
      url.searchParams.set('lang',locale);
      url.hash='token='+token;
      const text=words[locale];
      const reset=kind==='password_reset';
      const controller=new AbortController();
      let timer;
      const deadline=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({status:'unknown'});},timeoutMs);});
      const operation=(async()=>{
        try{
          const response=await transport(endpoint,{
            method:'POST',redirect:'error',signal:controller.signal,
            headers:{Authorization:'Bearer '+current.apiKey,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
            body:JSON.stringify({from:current.from,to:[address],subject:reset?text.reset:text.change,
              text:(reset?text.resetIntro:text.changeIntro)+'\n\n'+url.toString()+'\n\n'+text.expiry})
          });
          if(response?.ok)return {status:await receipt(response)?'accepted':'unknown'};
          await response?.body?.cancel().catch(()=>{});
          return {status:response?.status>=400&&response?.status<500&&![408,409,429].includes(response.status)?'failed':'unknown'};
        }catch{return {status:'unknown'};}
      })();
      const bounded=Promise.race([operation,deadline]);
      sends.add(bounded);
      try{return await bounded;}
      finally{clearTimeout(timer);sends.delete(bounded);}
    },
    drain,
    async close(){closed=true;await drain();}
  };
}
