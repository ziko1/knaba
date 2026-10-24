import { company, services } from '../data/company';

export const assistantLocales = ['de', 'en', 'uk', 'ru'] as const;
export type AssistantLocale = typeof assistantLocales[number];
export type Topic = 'services' | 'price' | 'region' | 'contact' | 'booking';
type Copy = { title:string; intro:string; mode:string; greeting:string; question:string; send:string; clear:string; you:string; language:string; privacy:string; limit:string; fallback:string; protected:string; price:string; region:string; booking:string; serviceIntro:string; details:string; inquiry:string; topics:Record<Topic,string>; names:readonly string[]; descriptions:readonly string[] };
export const assistantCopy:Record<AssistantLocale,Copy> = {
  de: {
    title:'KnaBa Assistent', intro:'Wie können wir Ihnen helfen?', mode:'Antworten aus unseren Website-Informationen · ohne Anmeldung',
    greeting:'Hallo! Ich helfe Ihnen bei Fragen zu unseren Reinigungsleistungen, unserem Einsatzgebiet und Ihrer Anfrage.', question:'Ihre Frage', send:'Senden', clear:'Gespräch zurücksetzen', you:'Sie', language:'Sprache',
    privacy:'Ihre Nachrichten bleiben in diesem Browserfenster und werden nicht gespeichert oder versendet. Eine Anfrage senden Sie separat über das Kontaktformular.', limit:'Bitte stellen Sie eine Frage mit höchstens 500 Zeichen.',
    fallback:'Dazu habe ich keine verlässliche Information. Wenden Sie sich bitte direkt an KnaBa oder wählen Sie eines der Themen unten.', protected:'Ich kann keine privaten Kundendaten, Aufträge oder Zugänge anzeigen oder ändern. Bitte wenden Sie sich direkt an KnaBa.',
    price:'Der Preis wird individuell nach Fläche, Reinigungsumfang, Turnus und Zugänglichkeit vereinbart. Auf der Website gibt es keine verbindliche Preisliste. Beschreiben Sie Ihr Objekt im Anfrageformular.',
    region:'KnaBa ist in Berlin und Brandenburg tätig. Ob Ihr konkreter Standort betreut werden kann, klärt das Team mit Ihnen.',
    booking:'Senden Sie Ihre Wünsche über das Kontaktformular. Umfang, Termin und Preis bestätigt das KnaBa-Team persönlich. Dieses Gespräch ist keine Buchung und wurde nicht an das Team gesendet.',
    serviceIntro:'KnaBa bietet folgende Reinigungsleistungen:', details:'Leistung ansehen', inquiry:'Reinigung anfragen',
    topics:{services:'Welche Leistungen?',price:'Was kostet die Reinigung?',region:'Wo sind Sie tätig?',contact:'Kontakt zu KnaBa',booking:'Reinigung anfragen'},
    names:services.map(s=>s.name), descriptions:services.map(s=>s.description+' '+s.questions),
  },
  en: {
    title:'KnaBa Assistant',intro:'How can we help?',mode:'Answers from our website information · no sign-in',
    greeting:'Hello! I can help with our cleaning services, service area and how to make an enquiry.',question:'Your question',send:'Send',clear:'Reset conversation',you:'You',language:'Language',
    privacy:'Your messages stay in this browser window and are neither saved nor sent. Send an enquiry separately using the contact form.',limit:'Please ask a question of no more than 500 characters.',
    fallback:'I do not have reliable information about that. Please contact KnaBa directly or choose one of the topics below.',protected:'I cannot view or change private customer data, orders or account access. Please contact KnaBa directly.',
    price:'Prices are agreed individually based on area, scope, frequency and access. The website does not publish a binding price list. Describe your property in the enquiry form.',
    region:'KnaBa serves Berlin and Brandenburg. The team will confirm whether your specific location can be covered.',
    booking:'Send your requirements using the contact form. The KnaBa team confirms the scope, date and price personally. This conversation is not a booking and has not been sent to the team.',
    serviceIntro:'KnaBa offers these cleaning services:',details:'View service (DE)',inquiry:'Request cleaning (DE)',
    topics:{services:'Which services?',price:'How much does cleaning cost?',region:'Where do you work?',contact:'Contact KnaBa',booking:'Request cleaning'},
    names:['Regular cleaning','Office cleaning','Glass and façade cleaning','Construction cleaning','Deep and specialist cleaning','Stairwell cleaning'],
    descriptions:['Regular cleaning of floors, surfaces, sanitary and shared areas. Frequency is agreed for your property.','Cleaning of workplaces, meeting rooms, reception, kitchens and sanitary areas. Tell us the office size and suitable access times.','Cleaning of windows, glass and façades, depending on material and access. Please describe the surfaces and how they can be reached.','Cleaning during construction and before handover. Tell us the construction stage and planned handover date.','Intensive cleaning for specific materials and conditions, agreed individually. Please describe the surfaces and dirt.','Cleaning of stairs, landings, entrances, handrails and contact surfaces. Tell us the number of floors and preferred frequency.'],
  },
  uk: {
    title:'Помічник KnaBa',intro:'Чим можемо допомогти?',mode:'Відповіді за інформацією сайту · без реєстрації',
    greeting:'Вітаю! Допоможу дізнатися про послуги прибирання, регіон роботи та подання заявки.',question:'Ваше запитання',send:'Надіслати',clear:'Почати розмову заново',you:'Ви',language:'Мова',
    privacy:'Повідомлення залишаються в цьому вікні браузера, не зберігаються й не надсилаються. Заявку потрібно окремо надіслати через контактну форму.',limit:'Напишіть запитання до 500 символів.',
    fallback:'Не маю достовірної інформації про це. Зверніться безпосередньо до KnaBa або виберіть одну з тем нижче.',protected:'Я не можу переглядати чи змінювати приватні дані клієнтів, замовлення або права доступу. Зверніться безпосередньо до KnaBa.',
    price:'Ціну погоджують індивідуально залежно від площі, обсягу робіт, періодичності й доступу. На сайті немає фіксованого прайсу. Опишіть свій об’єкт у формі заявки.',
    region:'KnaBa працює в Берліні та Бранденбурзі. Можливість прибирання за конкретною адресою підтвердить команда.',
    booking:'Надішліть побажання через контактну форму. Обсяг, дату й ціну особисто підтверджує команда KnaBa. Ця розмова не є замовленням і не була надіслана команді.',
    serviceIntro:'KnaBa пропонує такі послуги:',details:'Переглянути послугу (DE)',inquiry:'Подати заявку (DE)',
    topics:{services:'Які є послуги?',price:'Скільки коштує прибирання?',region:'Де ви працюєте?',contact:'Контакти KnaBa',booking:'Замовити прибирання'},
    names:['Регулярне прибирання','Прибирання офісів','Миття скла та фасадів','Прибирання після будівництва','Генеральне та спеціальне прибирання','Прибирання сходових кліток'],
    descriptions:['Прибирання підлог, поверхонь, санвузлів і спільних зон за погодженим графіком.','Прибирання робочих місць, переговорних, рецепції, кухні та санвузлів. Укажіть площу офісу та зручний час доступу.','Миття вікон, скла та фасадів з урахуванням матеріалів і доступу. Опишіть поверхні й можливість дістатися до них.','Прибирання під час будівництва та перед здачею об’єкта. Укажіть етап робіт і дату здачі.','Інтенсивне очищення з урахуванням матеріалів і стану поверхонь. Опишіть забруднення та вимоги.','Прибирання сходів, майданчиків, входів, поручнів і контактних поверхонь. Укажіть кількість поверхів та бажану періодичність.'],
  },
  ru: {
    title:'Помощник KnaBa',intro:'Чем можем помочь?',mode:'Ответы по информации сайта · без регистрации',
    greeting:'Здравствуйте! Помогу узнать об услугах уборки, регионе работы и подаче заявки.',question:'Ваш вопрос',send:'Отправить',clear:'Начать разговор заново',you:'Вы',language:'Язык',
    privacy:'Сообщения остаются в этом окне браузера, не сохраняются и не отправляются. Заявку нужно отдельно отправить через контактную форму.',limit:'Напишите вопрос до 500 символов.',
    fallback:'У меня нет достоверной информации об этом. Свяжитесь с KnaBa напрямую или выберите одну из тем ниже.',protected:'Я не могу просматривать или изменять личные данные клиентов, заказы или права доступа. Свяжитесь с KnaBa напрямую.',
    price:'Стоимость согласовывается индивидуально с учётом площади, объёма работ, периодичности и доступа. На сайте нет фиксированного прайса. Опишите объект в форме заявки.',
    region:'KnaBa работает в Берлине и Бранденбурге. Возможность уборки по конкретному адресу подтвердит команда.',
    booking:'Отправьте пожелания через контактную форму. Объём, дату и стоимость лично подтверждает команда KnaBa. Этот разговор не является заказом и не был отправлен команде.',
    serviceIntro:'KnaBa предлагает следующие услуги:',details:'Посмотреть услугу',inquiry:'Подать заявку',
    topics:{services:'Какие есть услуги?',price:'Сколько стоит уборка?',region:'Где вы работаете?',contact:'Контакты KnaBa',booking:'Заказать уборку'},
    names:['Регулярная уборка','Уборка офисов','Мытьё стекла и фасадов','Уборка после строительства','Генеральная и специальная уборка','Уборка лестничных клеток'],
    descriptions:['Уборка полов, поверхностей, санузлов и общих зон по согласованному графику.','Уборка рабочих мест, переговорных, приёмной, кухни и санузлов. Укажите площадь офиса и удобное время доступа.','Мытьё окон, стекла и фасадов с учётом материала и доступа. Опишите поверхности и возможность добраться до них.','Уборка во время строительства и перед сдачей объекта. Укажите этап работ и дату сдачи.','Интенсивная очистка с учётом материалов и состояния поверхностей. Опишите загрязнения и требования.','Уборка лестниц, площадок, входов, перил и контактных поверхностей. Укажите количество этажей и желаемую периодичность.'],
  },
};

/** Official knaba.de also mentions Bauhelfer / Bauhilfsarbeiten. This is NOT a new ERP service enum. */
const constructionHelpCopy: Record<AssistantLocale, {text:string;label:string}> = {
  de: {
    text:'KnaBa nennt neben der Baureinigung auch Bauhilfsarbeiten und Baustellenvorbereitung. Welche Aufgaben möglich sind, welchen Umfang sie haben und was sie kosten, klärt das Team direkt mit Ihnen. Der Reinigungsplaner bucht keine Bauhelfer.',
    label:'Bauhilfe anfragen',
  },
  en: {
    text:'KnaBa also lists construction support and site preparation alongside construction cleaning. Please ask the team directly about the available tasks, scope and price. The cleaning planner does not book construction helpers.',
    label:'Ask about construction support',
  },
  uk: {
    text:'KnaBa також зазначає допоміжні будівельні роботи та підготовку будмайданчика поряд із прибиранням після будівництва. Конкретні роботи, обсяг і вартість потрібно погодити безпосередньо з командою. Планер прибирання не бронює будівельних помічників.',
    label:'Запитати про будівельні роботи',
  },
  ru: {
    text:'KnaBa также указывает подсобные строительные работы и подготовку стройплощадки наряду с уборкой после строительства. Конкретные работы, объём и стоимость согласуются напрямую с командой. Планировщик уборки не бронирует строительных помощников.',
    label:'Уточнить строительные работы',
  },
};
const constructionHelpPattern = /bauhelfer|bauhilf|baustellenvorbereit|construction help|construction support|site preparation|будівельн.{0,12}робот|будмайданчик|будівельн.{0,12}помічник|подсобн.{0,12}работ|подготовк.{0,12}стройплощадк|строительн.{0,12}помощник|помощ.{0,10}стройк/;

export type AssistantAnswer = {text:string; links:{label:string;href:string}[]};
const servicePatterns = [/unterhalt|regular|регуляр|постійн/,/büro|buro|office|офіс|офис/,/glas|fenster|fassad|window|facade|вік|стекл|фасад|окн/,/baurein|baustell|construction|будів|строитель|ремонт/,/grundrein|sonderrein|deep clean|specialist|генераль|спеціаль|специаль/,/trepp|stair|сход|лестниц/];
function answerFromKnowledge(raw:string,locale:AssistantLocale,topic?:Topic):AssistantAnswer {
  const t=assistantCopy[locale];
  const inquiry={label:t.inquiry,href:'/kontakt/'};
  const contactLinks=[{label:company.phone,href:company.phoneHref},{label:company.email,href:`mailto:${company.email}`}];
  const question=raw.trim().normalize('NFKC').toLocaleLowerCase();
  if(!question || raw.length>500) return {text:t.limit,links:[]};
  if(/passwor|парол|customer data|kundendaten|private|приват|личн.{0,8}дан|admin|адмін|админ|ignore|ігнор|игнор/.test(question)) return {text:t.protected,links:contactLinks};
  if (constructionHelpPattern.test(question)) {
    const help = constructionHelpCopy[locale];
    return {text:help.text,links:[{label:help.label,href:locale==='ru'?'/ru/kontakt/':'/kontakt/'}]};
  }
  if(topic==='price'||/preis|kost|price|cost|ц[іе]н|кошту|скільки|сколько|стоим|стоит|€|euro/.test(question))return {text:t.price,links:[inquiry]};
  if(topic==='contact'||/kontakt|contact|телефон|phone|email|e-mail|пошт|почт|контакт|whatsapp|вотсап|ватсап/.test(question))return {text:`${company.name} · ${company.street}, ${company.city}\n${company.phone}\n${company.email}`,links:contactLinks};
  if(topic==='region'||/region|gebiet|where|wo\s|berlin|brandenburg|берл|бранден|регіон|регион|де ви|где вы/.test(question))return {text:t.region,links:[inquiry]};
  if(topic==='booking'||/buch|termin|verfüg|book|available|booking|замов|заказ|заявк|запис|вільн|свобод/.test(question))return {text:t.booking,links:[inquiry]};
  if(topic==='services')return {text:t.serviceIntro,links:services.map((s,i)=>({label:t.names[i],href:`/leistungen/${s.slug}/`}))};
  const index=servicePatterns.findIndex(pattern=>pattern.test(question));
  if(index>=0){const service=services[index];return {text:`${t.names[index]}\n${t.descriptions[index]}`,links:[{label:t.details,href:`/leistungen/${service.slug}/`},{label:t.inquiry,href:`/kontakt/?leistung=${service.slug}`}]};}
  if(/leistung|service|послуг|услуг|offer|пропону|предлага/.test(question))return {text:t.serviceIntro,links:services.map((s,i)=>({label:t.names[i],href:`/leistungen/${s.slug}/`}))};
  return {text:t.fallback,links:contactLinks};
}

export function answerQuestion(raw:string,locale:AssistantLocale,topic?:Topic):AssistantAnswer {
  const answer=answerFromKnowledge(raw,locale,topic);
  return locale==='ru' ? {...answer,links:answer.links.map(link=>({...link,href:link.href.startsWith('/')?`/ru${link.href}`:link.href}))} : answer;
}
