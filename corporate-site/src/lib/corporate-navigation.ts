import type {SiteLocale} from './site-i18n';

const labels: Record<string, Record<SiteLocale, string>> = {
  '/leistungen/': {pl:"Usługi budowlane",lt:"Statybų paslaugos",de:'Bauleistungen',en:'Services',uk:'Послуги',ru:'Услуги'},
  '/planer/': {pl:"Planowanie projektu",lt:"Projekto planavimas",de:'Projektplaner',en:'Project planner',uk:'Планувальник',ru:'Планировщик'},
  '/branchen/': {pl:"Branże B2B",lt:"B2B sektoriai",de:'Baupartner',en:'B2B sectors',uk:'Галузі B2B',ru:'Отрасли B2B'},
  '/unternehmen/': {pl:"O KnaBa",lt:"Apie KnaBa",de:'Über KnaBa',en:'About KnaBa',uk:'Про KnaBa',ru:'О KnaBa'},
  '/partner/': {pl:"Partnerzy",lt:"Partneriai",de:'Partner',en:'Partners',uk:'Партнери',ru:'Партнёры'},
  '/karriere/': {pl:"Praca",lt:"Karjera",de:'Karriere',en:'Careers',uk:'Робота',ru:'Вакансии'},
  '/kontakt/': {pl:"Kontakt",lt:"Kontaktai",de:'Kontakt',en:'Contact',uk:'Контакти',ru:'Контакты'},
  '/berlin/': {pl:"Berlin i Brandenburgia",lt:"Berlynas ir Brandenburgas",de:'Berlin & Brandenburg',en:'Berlin & Brandenburg',uk:'Берлін і Бранденбург',ru:'Берлин и Бранденбург'},
  '/ratgeber/': {pl:"Poradniki budowlane",lt:"Statybų patarimai",de:'Bauratgeber',en:'Construction guides',uk:'Поради',ru:'Советы'},
  '/galerie/': {pl:"Przebieg prac",lt:"Darbų eiga",de:'Arbeitsabläufe',en:'How we work',uk:'Як ми працюємо',ru:'Как мы работаем'},
  '/faq/': {pl:"Pytania i odpowiedzi",lt:"Klausimai ir atsakymai",de:'Fragen & Antworten',en:'Questions & answers',uk:'Запитання й відповіді',ru:'Вопросы и ответы'},
};
function normalPath(path: string) {
  const clean = path.split(/[?#]/, 1)[0];
  return clean.endsWith('/') ? clean : clean + '/';
}
export function corporateBreadcrumbs(pathname: string, locale: SiteLocale) {
  const path = normalPath(pathname).replace(/^\/(en|pl|lt|ru|uk)(?=\/)/, '');
  const label = labels[path]?.[locale];
  // Deep pages provide their own full trail; private and unknown URLs stay out.
  if (!label) return [];
  const prefix = locale === 'de' ? '' : '/' + locale;
  return [{name:'KnaBa',url:prefix+'/'},{name:label,url:prefix+path}];
}
export function navigationCurrent(pathname: string, href: string): 'page' | 'location' | undefined {
  const path = normalPath(pathname);
  const target = normalPath(href);
  if (path === target) return 'page';
  if (path.startsWith(target) || (target.endsWith('/leistungen/') && path.startsWith(target.replace(/\/leistungen\/$/, '/bauleistungen/')))) return 'location';
  return undefined;
}
