import type { ConstructionLocale } from './construction-offers';

/**
 * Five partner logos, in the exact order displayed under “UNSERE PARTNER”
 * on https://knaba.de/ on 2026-10-25.
 * The first two source assets have generic filenames and no accessible names
 * in the original HTML. Do not invent corporate identities for them.
 *
 * Asset URLs are explicit and fixed — never accept a visitor-controlled URL.
 * To make the page fully first-party, replace these CDN URLs with licensed
 * local copies after the actual image bytes can be verified.
 */
const media = 'https://impro.usercontent.one/appid/oneComWsb/domain/knaba.de/media/knaba.de/onewebmedia/';

export const officialPartnerLogos = [
  {
    id: 'official-01', name: null,
    src: media + 'Rf5da8e62e102cc22357161bd92c4cb74.jpeg?etag=%222959-60817516%22&ignoreAspectRatio=&quality=85&resize=149%2B121&sourceContentType=image%2Fjpeg',
    width: 149, height: 121,
  },
  {
    id: 'official-02', name: null,
    src: media + 'OIP.jpeg?etag=%2218d9-60817a36%22&ignoreAspectRatio=&quality=85&resize=150%2B104&sourceContentType=image%2Fjpeg',
    width: 150, height: 104,
  },
  {
    id: 'hit', name: 'HIT · Hanseatische Immobilien Treuhand',
    src: media + 'HIT-Hanseatische-Immobilien-Treuhand.png?etag=%221ec3-60817a40%22&ignoreAspectRatio=&resize=149%2B149&sourceContentType=image%2Fpng',
    width: 149, height: 149,
  },
  {
    id: 'stromkreis', name: 'Stromkreis',
    src: media + 'Stromkreis_Logo_Ihr-Energieexperte_Juni2020.png?etag=%2270b0-60817a50%22&ignoreAspectRatio=&resize=210%2B42&sourceContentType=image%2Fpng',
    width: 210, height: 42,
  },
  {
    id: 'gewobag', name: 'Gewobag',
    src: media + '1200px-Gewobag_logo.svg___serialized1.png?etag=%22edcf-60817aa9%22&ignoreAspectRatio=&resize=168%2B51&sourceContentType=image%2Fpng',
    width: 168, height: 51,
  },
] as const;

export const partnerCopy: Record<ConstructionLocale, {
  eyebrow: string; title: string; description: string; logo: string; unnamed: string;
}> = {
  de: {
    eyebrow: 'KnaBa / Netzwerk', title: 'Unsere Partner.',
    description: 'Unternehmen aus dem KnaBa-Partnernetzwerk.',
    logo: 'Logo von', unnamed: 'Partnerlogo aus der offiziellen KnaBa-Übersicht, Position',
  },
  en: {
    eyebrow: 'KnaBa / Network', title: 'Our partners.',
    description: 'Businesses in the KnaBa partner network.',
    logo: 'Logo of', unnamed: 'Partner logo from KnaBa’s official list, position',
  },
  uk: {
    eyebrow: 'KnaBa / Партнери', title: 'Наші партнери.',
    description: 'Компанії партнерської мережі KnaBa.',
    logo: 'Логотип', unnamed: 'Логотип із офіційного переліку партнерів KnaBa, позиція',
  },
  ru: {
    eyebrow: 'KnaBa / Партнёры', title: 'Наши партнёры.',
    description: 'Компании партнёрской сети KnaBa.',
    logo: 'Логотип', unnamed: 'Логотип из официального списка партнёров KnaBa, позиция',
  },
};
