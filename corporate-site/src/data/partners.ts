import type { ConstructionLocale } from './construction-offers';

/**
 * Official KNABA partner-list sequence as audited 2026-10-26.
 * GOLDBECK and BONAVA are identified from the two original logo images;
 * the official names/relationships and trademark rights still require
 * customer/rightsholder sign-off before public release.
 * All fixed assets come from existing PR #75 and load from our own origin.
 */
export const officialPartnerLogos = [
  {id:'official-01', name:'GOLDBECK', src:'/images/partners/goldbeck.jpg', width:149, height:121},
  {id:'official-02', name:'BONAVA', src:'/images/partners/bonava.jpg', width:150, height:104},
  {id:'hit', name:'HIT · Hanseatische Immobilien Treuhand', src:'/images/partners/hit.png', width:149, height:149},
  {id:'stromkreis', name:'Stromkreis', src:'/images/partners/stromkreis.png', width:210, height:42},
  {id:'gewobag', name:'Gewobag', src:'/images/partners/gewobag.png', width:168, height:51},
] as const;

export const partnerCopy: Record<ConstructionLocale, {
  eyebrow:string; title:string; description:string; logo:string;
}> = {
  de:{eyebrow:'KnaBa / Netzwerk',title:'Unsere Partner.',description:'Unternehmen aus dem KnaBa-Partnernetzwerk.',logo:'Logo von'},
  en:{eyebrow:'KnaBa / Network',title:'Our partners.',description:'Businesses in the KnaBa partner network.',logo:'Logo of'},
  uk:{eyebrow:'KnaBa / Партнери',title:'Наші партнери.',description:'Компанії партнерської мережі KnaBa.',logo:'Логотип'},
  ru:{eyebrow:'KnaBa / Партнёры',title:'Наши партнёры.',description:'Компании партнёрской сети KnaBa.',logo:'Логотип'},
};
