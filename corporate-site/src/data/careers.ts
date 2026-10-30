import {company} from './company';
import type {ConstructionLocale} from './construction-offers';
export const careersCopy = {
  de:{action:'Mitarbeit anfragen',title:'Interesse an einer Mitarbeit?',intro:'Schreiben Sie kurz, welche Tätigkeiten Sie suchen, welche Erfahrung Sie mitbringen und wann Sie verfügbar sind. Aktuelle Möglichkeiten besprechen Sie direkt mit KnaBa.',privacy:'Für den ersten Kontakt genügen eine kurze Nachricht und Ihre Kontaktdaten. Bitte keine Ausweiskopien, Bank- oder Gesundheitsdaten senden.',subject:'Bewerbung / Tätigkeitsanfrage — KnaBa'},
  en:{action:'Ask about working with us',title:'Interested in working with KnaBa?',intro:'Briefly describe the work you are looking for, your experience and availability. Discuss current opportunities directly with KnaBa.',privacy:'A short message and your contact details are enough to start. Please do not send identity documents, bank details or health information.',subject:'Work enquiry — KnaBa'},
  uk:{action:'Запитати про роботу',title:'Хочете працювати з KnaBa?',intro:'Коротко напишіть, які завдання вас цікавлять, який досвід маєте та коли можете почати. Актуальні можливості обговоріть безпосередньо з KnaBa.',privacy:'Для першого звернення достатньо короткого повідомлення й контактів. Не надсилайте копії посвідчень, банківські чи медичні дані.',subject:'Запит щодо роботи — KnaBa'},
  ru:{action:'Узнать о работе',title:'Хотите работать с KnaBa?',intro:'Кратко напишите, какие задачи вас интересуют, какой опыт у вас есть и когда можете начать. Актуальные возможности обсудите напрямую с KnaBa.',privacy:'Для первого обращения достаточно короткого сообщения и контактов. Не отправляйте копии удостоверений, банковские или медицинские данные.',subject:'Запрос о работе — KnaBa'},
} satisfies Record<ConstructionLocale,{action:string;title:string;intro:string;privacy:string;subject:string}>;
export function careersHref(locale: ConstructionLocale) {
  return `mailto:${company.email}?subject=${encodeURIComponent(careersCopy[locale].subject)}`;
}
