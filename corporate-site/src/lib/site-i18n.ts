import { services } from '../data/company';
import { guides } from '../data/seo-content';

export type SiteLocale = 'de' | 'en' | 'uk' | 'ru';
type Alternate = { lang: string; url: string };
const germanPaths = [
  '/', '/leistungen/', '/branchen/', '/unternehmen/', '/karriere/',
  '/kontakt/', '/planer/', '/impressum/', '/datenschutz/', '/berlin/', '/ratgeber/',
  ...services.map(service => `/leistungen/${service.slug}/`),
  ...guides.map(guide => `/ratgeber/${guide.slug}/`),
];
export const russianPublicPaths = germanPaths.map(path => `/ru${path}`);
const localizedPaths = new Set([...germanPaths, '/konto/', '/assistent/', '/portal/']);

function equivalentPath(pathname: string): string | undefined {
  const path = pathname.replace(/^\/ru(?=\/)/, '') || '/';
  if (path === '/en/' || path === '/uk/') return '/';
  return localizedPaths.has(path) ? path : undefined;
}

/** Detailed EN/UK translations do not exist; link to their honest overview. */
export function languageLinks(pathname: string): Alternate[] {
  const path = equivalentPath(pathname) ?? '/';
  return [
    { lang: 'de', url: path },
    { lang: 'en', url: '/en/' },
    { lang: 'uk', url: '/uk/' },
    { lang: 'ru', url: `/ru${path}` },
  ];
}

export function localeAlternates(pathname: string, existing: Alternate[] = []): Alternate[] {
  const path = equivalentPath(pathname);
  if (!path || ['/konto/','/assistent/','/portal/'].includes(path)) return existing;
  if (path === '/') return [...languageLinks(path), { lang: 'x-default', url: '/' }];
  return [
    { lang: 'de', url: path },
    { lang: 'ru', url: `/ru${path}` },
    { lang: 'x-default', url: path },
  ];
}
