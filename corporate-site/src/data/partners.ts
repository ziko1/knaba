import type {ConstructionLocale} from './construction-offers';

// Original logos listed on the official company homepage; no new endorsements.
export const partnerSource = {url:'https://knaba.de/',checkedOn:'2026-10-25'} as const;
export const partners = [
  {name:'GOLDBECK',image:'/images/partners/goldbeck.jpeg',width:210,height:170},
  {name:'Bonava',image:'/images/partners/bonava.jpeg',width:407,height:283},
  {name:'HIT · Hanseatische Immobilien Treuhand',image:'/images/partners/hit.png',width:400,height:400},
  {name:'Stromkreis',image:'/images/partners/stromkreis.png',width:1682,height:338},
  {name:'Gewobag',image:'/images/partners/gewobag.png',width:1200,height:367},
] as const;

export const partnersCopy = {
  de:{label:'PARTNER',title:'Unsere Partner.',intro:'Diese Unternehmen werden auf knaba.de als Partner vorgestellt.',source:'Partner auf knaba.de ansehen',checked:'Quelle geprüft am',date:'25.10.2026'},
  en:{label:'PARTNERS',title:'Our partners.',intro:'These companies are presented as partners on knaba.de.',source:'View partners on knaba.de',checked:'Source checked on',date:'25 October 2026'},
  uk:{label:'ПАРТНЕРИ',title:'Наші партнери.',intro:'Ці компанії зазначені як партнери на knaba.de.',source:'Переглянути партнерів на knaba.de',checked:'Джерело перевірено',date:'25.10.2026'},
  ru:{label:'ПАРТНЁРЫ',title:'Наши партнёры.',intro:'Эти компании указаны как партнёры на knaba.de.',source:'Посмотреть партнёров на knaba.de',checked:'Источник проверен',date:'25.10.2026'},
} satisfies Record<ConstructionLocale,{label:string;title:string;intro:string;source:string;checked:string;date:string}>;
