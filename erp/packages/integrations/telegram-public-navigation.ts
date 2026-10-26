import {botModulesFor,botModuleLabel,botModuleSiteUrl} from './bot-module-catalog.ts';
import type {SupportedLanguage} from './deepseek.ts';

/**
 * Restricted public Telegram command classifier. A Telegram chat ID is NOT an
 * authenticated KNABA employee/owner; no command here can grant a role, approve
 * registration, activate automation, sign a quote or access ERP records.
 */
export type TelegramPublicIntent='MENU'|'SERVICES'|'ENQUIRY'|'REGISTER'|'CONTACT'|'PRIVACY'|'HUMAN';
const intents:Readonly<Record<string,TelegramPublicIntent>>={
  '/menu':'MENU','/help':'MENU','/services':'SERVICES','/leistungen':'SERVICES',
  '/request':'ENQUIRY','/angebot':'ENQUIRY','/register':'REGISTER',
  '/worker':'REGISTER','/mitarbeiter':'REGISTER','/contact':'CONTACT',
  '/call':'CONTACT','/privacy':'PRIVACY','/datenschutz':'PRIVACY',
  '/human':'HUMAN','/owner':'HUMAN'
};
export function telegramPublicIntent(text:unknown):TelegramPublicIntent|undefined {
  if(typeof text!=='string'||text.length>80||text.includes('\n'))return;
  const input=text.trim().toLowerCase();
  if(input==='/start'||input==='/start website')return 'MENU';
  return Object.hasOwn(intents,input)?intents[input]:undefined;
}
/** Presentation only, disabled for outbound until consent and provider gate. */
export function telegramPublicMenu(language:SupportedLanguage,officialWebsiteOrigin:string):string {
  const rows=botModulesFor(undefined,false);
  const byId=new Map(rows.map(row=>[row.id,row]));
  const order=['services','enquiry','planner','contact','account','privacy'] as const;
  const origin=new URL(officialWebsiteOrigin);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')
    throw Error('INVALID_PUBLIC_ORIGIN');
  const lines=order.map(id=>{
    const module=byId.get(id);
    if(!module)throw Error('MISSING_PUBLIC_MODULE');
    const href=botModuleSiteUrl(module,origin.toString());
    if(!href)throw Error('INVALID_PUBLIC_MODULE');
    return botModuleLabel(module,language)+': '+href;
  });
  return 'KNABA · '+(language==='DE'?'Beratung':language==='UK'?'Консультації':language==='RU'?'Консультации':'Consultation')+'\n'+lines.join('\n');
}

/** Public-only deterministic response. No AI model, employee data or arbitrary links. */
export function telegramPublicReply(intent:TelegramPublicIntent,language:SupportedLanguage,publicOrigin:string):string {
  const catalog=botModulesFor(undefined,false);
  const get=(id:string)=>{
    const row=catalog.find(item=>item.id===id);
    if(!row)throw Error('MISSING_PUBLIC_MODULE');
    const link=botModuleSiteUrl(row,publicOrigin);
    if(!link)throw Error('INVALID_PUBLIC_ORIGIN');
    return link;
  };
  if(intent==='MENU')return telegramPublicMenu(language,publicOrigin);
  const texts:Record<TelegramPublicIntent,Record<'DE'|'UK'|'RU'|'EN',string>>={
    MENU:{DE:'',UK:'',RU:'',EN:''},
    SERVICES:{DE:'KnaBa BauService: Leistungen und aktuelle Informationen.',UK:'Послуги KnaBa та перевірена інформація.',RU:'Услуги KnaBa и актуальная информация.',EN:'KnaBa services and verified information.'},
    ENQUIRY:{DE:'Anfrage über das sichere Formular senden. Preise und Termine bestätigt nur KnaBa.',UK:'Залиште заявку через захищену форму. Ціни й час підтверджує компанія.',RU:'Подайте заявку через защищённую форму. Цены и время подтверждает компания.',EN:'Send an enquiry with the secure form. Only KnaBa confirms prices and dates.'},
    REGISTER:{DE:'Ihre Mitarbeiteranfrage wird geprüft. Ein Konto oder eine Mitarbeiterrolle wurde dadurch NICHT erstellt. Identität nur im sicheren Portal bestätigen.',UK:'Звернення працівника зафіксовано. Обліковий запис і роль НЕ створено. Підтверджуйте особу лише в захищеному кабінеті.',RU:'Обращение сотрудника записано. Учётная запись и роль НЕ созданы. Проверяйте личность только в защищённом кабинете.',EN:'Worker enquiry recorded. No account or staff role granted. Verify identity through the secure portal only.'},
    CONTACT:{DE:'Kontakt oder Rückruf anfragen. Ein KI-Telefonanruf wurde nicht gestartet.',UK:'Контакти або запит зворотного дзвінка. AI-дзвінок не розпочато.',RU:'Контакты или запрос обратного звонка. AI-звонок не начат.',EN:'Contact or request a callback. No AI phone call has started.'},
    PRIVACY:{DE:'Hinweise zur Datenverarbeitung:',UK:'Інформація щодо обробки даних:',RU:'Информация об обработке данных:',EN:'Privacy information:'},
    HUMAN:{DE:'Ihr Anliegen ist für die persönliche Bearbeitung eingegangen. Keine Antwortzeit zugesagt.',UK:'Звернення передано для опрацювання людиною. Час відповіді не гарантовано.',RU:'Обращение передано оператору. Время ответа не гарантируется.',EN:'Your request is queued for a human operator. No response time is guaranteed.'}
  };
  const locale=['DE','UK','RU','EN'].includes(language)?language as 'DE'|'UK'|'RU'|'EN':'DE';
  const routes:Record<TelegramPublicIntent,string>={
    MENU:'services',SERVICES:'services',ENQUIRY:'enquiry',REGISTER:'account',
    CONTACT:'contact',PRIVACY:'privacy',HUMAN:'contact'
  };
  const response=texts[intent][locale]+'\n'+get(routes[intent]);
  if(response.length>4096)throw Error('PUBLIC_REPLY_TOO_LONG');
  return response;
}
