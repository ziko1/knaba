import type { ConstructionLocale } from './construction-offers';

/** Sixth tile is an enquiry flow, never an invented additional KnaBa service. */
export const projectCard: Record<ConstructionLocale,{title:string;description:string;action:string}> = {
  de: {title:'Ihr Bauprojekt planen',description:'Sie haben einen konkreten Bauabschnitt? Beschreiben Sie Fläche, Zeitraum und Leistungsbedarf – wir stimmen den Umfang persönlich ab.',action:'Anfrage vorbereiten'},
  en: {title:'Plan your next project',description:'Tell us about the construction phase, site size and preferred timeframe. We will review the scope together.',action:'Prepare an enquiry'},
  uk: {title:'Спланувати ваш проєкт',description:'Розкажіть про етап будівництва, площу об’єкта та строки. Обсяг робіт узгодимо індивідуально.',action:'Підготувати запит'},
  ru: {title:'Спланировать ваш проект',description:'Расскажите об этапе строительства, площади объекта и сроках. Согласуем объём работ индивидуально.',action:'Подготовить запрос'}
};
