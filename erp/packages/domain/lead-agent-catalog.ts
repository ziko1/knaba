/** Public capability catalogue. A listing is not a connected account or an authorization. */
export type SourceId = 'berlin_vergabe'|'ted'|'oeffentliche_vergabe'|'myhammer'|'kleinanzeigen'|'blauarbeit'|'check24'|'auftragsbank'|'listando'|'aroundhome'|'houzz'|'dtad'|'brandenburg'|'knaba';
export type Capability = 'PUBLIC_READ'|'PERMISSION_REQUIRED'|'CONTRACT_REQUIRED'|'NOT_IMPLEMENTED'|'EXISTING_MODULE';
export interface LeadSource {
  id: SourceId; name: string; url: string; documentation: string;
  read: Capability; send: 'UNSUPPORTED'; account: 'NOT_REQUIRED'|'EXTERNAL_ACCOUNT'|'EXISTING_KNABA';
  note: string; checkedAt: string;
}
export const LEAD_SOURCES: readonly LeadSource[] = [
  {id:'berlin_vergabe',name:'Vergabeplattform Berlin',url:'https://www.berlin.de/vergabeplattform/veroeffentlichungen/bekanntmachungen/',documentation:'https://www.berlin.de/vergabeplattform/veroeffentlichungen/bekanntmachungen/',read:'PUBLIC_READ',account:'NOT_REQUIRED',send:'UNSUPPORTED',note:'Офіційний RSS нових тендерів. Це обмежена стрічка, а не повний архів. Подання пропозиції — на платформі.',checkedAt:'2026-11-08'},
  {id:'ted',name:'TED · EU tenders',url:'https://ted.europa.eu/',documentation:'https://docs.ted.europa.eu/api/latest/search.html',read:'PUBLIC_READ',account:'NOT_REQUIRED',send:'UNSUPPORTED',note:'Офіційний Search API. Пошук публічних оголошень; вимоги та чинність перевіряються у тендерній документації.',checkedAt:'2026-11-08'},
  {id:'oeffentliche_vergabe',name:'Öffentliche Vergabe',url:'https://oeffentlichevergabe.de/',documentation:'https://oeffentlichevergabe.de/documentation/swagger-ui/opendata/index.html',read:'NOT_IMPLEMENTED',account:'NOT_REQUIRED',send:'UNSUPPORTED',note:'Open Data доступний; адаптер цього релізу ще не реалізовано.',checkedAt:'2026-11-08'},
  {id:'myhammer',name:'MyHammer',url:'https://www.my-hammer.de/',documentation:'https://www.my-hammer.de/allgemeine-geschaefts-bedingungen',read:'PERMISSION_REQUIRED',account:'EXTERNAL_ACCOUNT',send:'UNSUPPORTED',note:'Потрібен підтверджений дозволений спосіб інтеграції. Вхід у власний акаунт не дозволяє автоматичне збирання. Запит контакту може створити платне зобов’язання.',checkedAt:'2026-11-08'},
  {id:'kleinanzeigen',name:'Kleinanzeigen',url:'https://www.kleinanzeigen.de/',documentation:'https://themen.kleinanzeigen.de/nutzungsbedingungen/',read:'PERMISSION_REQUIRED',account:'EXTERNAL_ACCOUNT',send:'UNSUPPORTED',note:'Для автоматичного доступу потрібна згода платформи. Кнопка відкриває офіційний сайт для роботи користувача.',checkedAt:'2026-11-08'},
  ...([
    ['blauarbeit','Blauarbeit','https://www.blauarbeit.de/'],
    ['check24','CHECK24 Profis','https://profis.check24.de/'],
    ['auftragsbank','Auftragsbank','https://www.auftragsbank.de/'],
    ['listando','Listando','https://www.listando.de/'],
    ['aroundhome','Aroundhome','https://www.aroundhome.de/'],
    ['houzz','Houzz Pro','https://www.houzz.de/pro'],
    ['brandenburg','Vergabemarktplatz Brandenburg','https://vergabemarktplatz.brandenburg.de/']
  ] as const).map(([id,name,url]):LeadSource=>({id,name,url,documentation:url,read:'NOT_IMPLEMENTED',account:'EXTERNAL_ACCOUNT',send:'UNSUPPORTED',note:'Окремий адаптер, право доступу та операції акаунта ще не підтверджені. Автоматичні дії недоступні.',checkedAt:'2026-11-08'})),
  {id:'dtad',name:'DTAD',url:'https://www.dtad.com/de/lead-management',documentation:'https://www.dtad.com/de/lead-management',read:'CONTRACT_REQUIRED',account:'EXTERNAL_ACCOUNT',send:'UNSUPPORTED',note:'API пропонується за договором. Потрібні власний договір, обсяг доступу та погоджений бюджет.',checkedAt:'2026-11-08'},
  {id:'knaba',name:'KNABA · власні звернення',url:'https://knaba.de/',documentation:'https://knaba.de/',read:'EXISTING_MODULE',account:'EXISTING_KNABA',send:'UNSUPPORTED',note:'Власні клієнтські звернення обробляються чинним CRM та Inbox KNABA. Їх не дублюємо імпортом.',checkedAt:'2026-11-08'}
];
export const SEARCHABLE_SOURCES = ['berlin_vergabe','ted'] as const;
export const TRADE_CATEGORIES = [
  {id:'painting',uk:'Малярні роботи',de:'Malerarbeiten',words:['maler','anstrich','lackier','фарбув','маляр'],cpv:['45442100']},
  {id:'drywall',uk:'Гіпсокартон і внутрішні роботи',de:'Trockenbau',words:['trockenbau','innenausbau','гіпсокартон'],cpv:['45421141']},
  {id:'flooring',uk:'Підлога та плитка',de:'Boden- und Fliesenarbeiten',words:['bodenbelag','fliesen','parkett','плитк','підлог'],cpv:['45430000']},
  {id:'cleaning',uk:'Прибирання',de:'Reinigungsleistungen',words:['reinigung','glasreinigung','прибиран'],cpv:['90910000']},
  {id:'landscaping',uk:'Сад і територія',de:'Garten- und Landschaftsbau',words:['garten','landschaft','freianlagen','grünpflege','сад','територ'],cpv:['45112700','77310000']},
  {id:'construction',uk:'Будівництво та ремонт',de:'Bau- und Sanierungsarbeiten',words:['bauarbeiten','sanierung','beton','ремонт','будів'],cpv:['45000000']},
  {id:'moving',uk:'Переїзди й перевезення',de:'Umzug und Transport',words:['umzug','transport','перевез','переїзд'],cpv:['60100000']},
  {id:'installation',uk:'Монтаж',de:'Montage',words:['montage','installation','монтаж'],cpv:['45300000']}
] as const;
