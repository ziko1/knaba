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
