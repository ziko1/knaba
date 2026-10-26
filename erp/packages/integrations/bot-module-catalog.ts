import type {Actor} from '../domain/core.ts';
import type {SupportedLanguage} from './deepseek.ts';

/**
 * Read-only navigation inventory for KNABA messaging channels. This is NOT an
 * entitlement source, single sign-on, or evidence that disconnected ERP screens
 * are deployed. Every business command is still authorized by the ERP Engine.
 */
export type BotModuleStatus = 'SITE_LINK'|'WHATSAPP_COMMAND'|'SOURCE_ONLY';
export type BotModuleAudience = 'PUBLIC'|'STAFF'|'OWNER';
export type BotModuleId =
  | 'services'|'enquiry'|'planner'|'contact'|'account'|'privacy'
  | 'shifts'|'hours'|'travel'|'tasks'|'materials'|'payroll'|'team_chat'|'gps'
  | 'owner_inbox'|'crm'|'cms'|'owner_admin'|'automation'
  | 'orders'|'planning'|'employees'|'quality'|'finance'|'analytics'|'documents';
export interface BotModule {
  id:BotModuleId;
  label:readonly [string,string,string,string,string,string]; // DE,UK,RU,PL,LT,EN
  audience:BotModuleAudience;
  status:BotModuleStatus;
  permission?:string;
  path?:string;
  command?:string;
}
const modules:readonly BotModule[]=[
  {id:'services',label:['Leistungen','Послуги','Услуги','Usługi','Paslaugos','Services'],audience:'PUBLIC',status:'SITE_LINK',path:'/leistungen/'},
  {id:'enquiry',label:['Anfrage senden','Надіслати заявку','Отправить заявку','Wyślij zapytanie','Siųsti užklausą','Send enquiry'],audience:'PUBLIC',status:'SITE_LINK',path:'/kontakt/'},
  {id:'planner',label:['Projekt planen','Планувальник','Планировщик','Plan projektu','Projekto planas','Project planner'],audience:'PUBLIC',status:'SITE_LINK',path:'/planer/'},
  {id:'contact',label:['Kontakt / Rückruf','Контакт / дзвінок','Контакт / звонок','Kontakt','Susisiekite','Contact / callback'],audience:'PUBLIC',status:'SITE_LINK',path:'/kontakt/'},
  {id:'account',label:['Konto / Anmeldung','Кабінет / реєстрація','Кабинет / регистрация','Konto','Paskyra','Account / registration'],audience:'PUBLIC',status:'SITE_LINK',path:'/konto/'},
  {id:'privacy',label:['Datenschutz','Конфіденційність','Конфиденциальность','Prywatność','Privatumas','Privacy'],audience:'PUBLIC',status:'SITE_LINK',path:'/datenschutz/'},
  {id:'shifts',label:['Schichten','Зміни','Смены','Zmiany','Pamainos','Shifts'],audience:'STAFF',status:'WHATSAPP_COMMAND',permission:'shift.manage',command:'SHIFT'},
  {id:'hours',label:['Meine Stunden','Мої години','Мои часы','Moje godziny','Mano valandos','My hours'],audience:'STAFF',status:'WHATSAPP_COMMAND',permission:'shift.read',command:'HOURS'},
  {id:'travel',label:['Dienstreisen','Переїзди','Переезды','Przejazdy','Kelionės','Work travel'],audience:'STAFF',status:'WHATSAPP_COMMAND',permission:'trip.manage',command:'TRAVEL'},
  {id:'tasks',label:['Aufgaben','Завдання','Задания','Zadania','Užduotys','Tasks'],audience:'STAFF',status:'WHATSAPP_COMMAND',permission:'task.read',command:'TASKS'},
  {id:'materials',label:['Materialanfragen','Заявки матеріалів','Заявки материалов','Materiały','Medžiagos','Material requests'],audience:'STAFF',status:'WHATSAPP_COMMAND',permission:'inventory.request',command:'MATERIALS'},
  {id:'payroll',label:['Meine Auszahlungen','Мої виплати','Мои выплаты','Wypłaty','Išmokos','My payouts'],audience:'STAFF',status:'WHATSAPP_COMMAND',permission:'finance.payout.ack',command:'PAYROLL'},
  {id:'team_chat',label:['Team-Chat','Чат команди','Чат команды','Czat zespołu','Komandos pokalbis','Team chat'],audience:'STAFF',status:'WHATSAPP_COMMAND',permission:'chat.read',command:'CHATS'},
  {id:'gps',label:['Gerät / GPS-Hinweis','Пристрій / GPS','Устройство / GPS','Urządzenie / GPS','Įrenginys / GPS','Device / GPS notice'],audience:'STAFF',status:'WHATSAPP_COMMAND',permission:'device.self',command:'GPS'},
  {id:'owner_inbox',label:['Postfach / Kunden','Вхідні звернення','Входящие обращения','Skrzynka klientów','Klientų laiškai','Customer inbox'],audience:'OWNER',status:'SITE_LINK',permission:'bot.manage',path:'/postfach/'},
  {id:'crm',label:['Kunden / CRM','Клієнти / CRM','Клиенты / CRM','Klienci / CRM','Klientai / CRM','Customers / CRM'],audience:'OWNER',status:'SITE_LINK',permission:'lead.manage',path:'/crm/'},
  {id:'cms',label:['Webseite / CMS','Сайт / CMS','Сайт / CMS','Strona / CMS','Svetainė / CMS','Website / CMS'],audience:'OWNER',status:'SITE_LINK',permission:'bot.settings.manage',path:'/studio/'},
  {id:'owner_admin',label:['Rechte / Freigaben','Ролі / погодження','Роли / согласования','Role / zatwierdzenia','Rolės / leidimai','Roles / approvals'],audience:'OWNER',status:'SITE_LINK',permission:'identity.manage',path:'/admin/'},
  {id:'automation',label:['Automationen entwerfen','Чернетки автоматизацій','Черновики автоматизаций','Automatyzacje','Automatizavimas','Automation drafts'],audience:'OWNER',status:'WHATSAPP_COMMAND',permission:'automation.manage',command:'AUTOMATIONS'},
  {id:'orders',label:['Aufträge / Angebote','Замовлення / пропозиції','Заказы / предложения','Zlecenia / oferty','Užsakymai','Orders / quotes'],audience:'OWNER',status:'SOURCE_ONLY',permission:'commerce.read'},
  {id:'planning',label:['Einsatzplanung','Планування виїздів','Планирование выездов','Harmonogram','Tvarkaraštis','Dispatch planning'],audience:'OWNER',status:'SOURCE_ONLY',permission:'dispatch.read'},
  {id:'employees',label:['Personal / Onboarding','Персонал / реєстрація','Персонал / регистрация','Personel','Darbuotojai','Staff / onboarding'],audience:'OWNER',status:'WHATSAPP_COMMAND',permission:'identity.manage',command:'WORKERS'},
  {id:'quality',label:['Qualität / Abnahmen','Контроль якості','Контроль качества','Kontrola jakości','Kokybės kontrolė','Quality / acceptance'],audience:'OWNER',status:'SOURCE_ONLY',permission:'task.review'},
  {id:'finance',label:['Buchhaltung','Бухгалтерія','Бухгалтерия','Księgowość','Apskaita','Accounting'],audience:'OWNER',status:'SOURCE_ONLY',permission:'finance.payroll'},
  {id:'analytics',label:['Berichte / Analyse','Звіти / аналітика','Отчёты / аналитика','Raporty','Ataskaitos','Reports / analytics'],audience:'OWNER',status:'SOURCE_ONLY',permission:'report.read'},
  {id:'documents',label:['Dokumente / Archiv','Документи / архів','Документы / архив','Dokumenty','Dokumentai','Documents / archive'],audience:'OWNER',status:'SOURCE_ONLY',permission:'report.read'}
];
const languageIndex:Record<SupportedLanguage,number>={DE:0,UK:1,RU:2,PL:3,LT:4,EN:5};
const externalRoles=new Set(['GUEST','CLIENT','CUSTOMER','EXTERNAL_BAULEITER']);
const ownerRoles=new Set(['OWNER','DIRECTOR','OPERATIONS_MANAGER','BOT_ADMIN']);

export function botModuleLabel(row:BotModule,language:SupportedLanguage):string {
  return row.label[languageIndex[language]];
}

/** Never derive staff/owner rights from Telegram sender id or phone alone. */
export function botModulesFor(actor:Pick<Actor,'roles'|'permissions'>|undefined, verifiedErpIdentity:boolean):readonly BotModule[] {
  const trusted=verifiedErpIdentity&&actor&&
    !actor.roles.some(role=>externalRoles.has(role))&&!actor.roles.includes('SERVICE_ACCOUNT');
  return modules.filter(row=>{
    if(row.audience==='PUBLIC')return true;
    if(!trusted || !row.permission || !actor!.permissions.includes(row.permission))return false;
    if(row.id==='automation'&&!actor!.roles.includes('OWNER'))return false;
    return row.audience==='STAFF' || actor!.roles.some(role=>ownerRoles.has(role));
  });
}
export function botModuleById(id:unknown,actor:Pick<Actor,'roles'|'permissions'>|undefined,verifiedErpIdentity:boolean):BotModule|undefined {
  return typeof id==='string'?botModulesFor(actor,verifiedErpIdentity).find(row=>row.id===id):undefined;
}
/** No configurable redirect destinations; these are inspected repository routes. */
export function botModuleSiteUrl(row:BotModule,publicOrigin:string|undefined):string|undefined {
  if(row.status!=='SITE_LINK'||!row.path||!publicOrigin)return;
  const origin=new URL(publicOrigin);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')return;
  const allowed=new Set(['/leistungen/','/kontakt/','/planer/','/konto/','/datenschutz/','/postfach/','/crm/','/studio/','/admin/']);
  if(!allowed.has(row.path))return;
  return new URL(row.path,origin).toString();
}
