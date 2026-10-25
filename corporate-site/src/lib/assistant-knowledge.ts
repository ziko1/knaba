/** Public, verified-site only responses. No model calls, prices or appointment promises. */
export type AssistantLocale = 'de' | 'en' | 'uk' | 'ru';
export const supportedAssistantLocales: readonly AssistantLocale[] = ['de','en','uk','ru'];

export function assistantLocale(input: unknown): AssistantLocale {
  return typeof input === 'string' && supportedAssistantLocales.includes(input as AssistantLocale) ? input as AssistantLocale : 'de';
}
const dictionary = {
  de: {
    welcome: 'Hallo! Ich helfe Ihnen bei Fragen zur Baureinigung und zum BauService in Berlin und Brandenburg. Für ein verbindliches Angebot oder einen Termin verbinde ich Sie mit KnaBa.',
    handoff: 'Ich habe Ihre Bitte um persönlichen Kontakt vorgemerkt. KnaBa kann Ihnen hier im Gespräch antworten. Bitte lassen Sie dieses Gespräch auf Ihrem Gerät gespeichert oder nutzen Sie Telefon/E-Mail.',
    price: 'Der Preis hängt von Bauphase, Fläche, Zustand, Zugang und Leistungsumfang ab. Wir erstellen nur nach persönlicher Abstimmung ein individuelles Angebot. Soll ich den Inhaber hinzuziehen?',
    region: 'KnaBa bespricht Baureinigung und Bauhilfsarbeiten für Projekte in Berlin und Brandenburg. Die konkrete Verfügbarkeit wird persönlich geklärt.',
    services: 'Wir beraten zu Baugrob-, Bauzwischen-, Baufein- und Bauendreinigung sowie Bauhilfe. Kernbohrungen und Durchbrüche sind nur nach technischer Prüfung und separatem Vertrag möglich. Welche Bauphase betrifft Ihr Projekt?',
    timing: 'Termine und Häufigkeit vereinbaren wir individuell. Ich kann keinen Termin automatisch zusagen. Möchten Sie Ihren Wunschtermin an den Inhaber übermitteln?',
    fallback: 'Gern helfe ich weiter. Um welches Objekt und welche Reinigungsleistung geht es? Für genaue Konditionen verbinden wir Sie direkt mit KnaBa.',
  },
  en: {
    welcome: 'Hello! I can help with construction cleaning and site services in Berlin and Brandenburg. For confirmed quotes or dates, I can connect you with KnaBa.',
    handoff: 'Your request for a person is recorded. KnaBa can reply in this conversation. Keep the conversation on this device, or use phone/email.',
    price: 'Pricing depends on the project stage, area, access and agreed scope. Only KnaBa can provide a confirmed individual quote. Would you like to contact the owner?',
    region: 'KnaBa handles construction cleaning enquiries in Berlin and Brandenburg. Specific availability must be confirmed directly.',
    services: 'Our focus is construction cleaning, site clearance and auxiliary construction tasks. Concrete core drilling and penetrations require technical checks and a separate qualified contractor agreement.',
    timing: 'Dates and frequency are agreed personally. I cannot confirm a booking. Should I pass your preferred time to KnaBa?',
    fallback: 'I can help. What kind of property and cleaning service do you need? For a firm agreement, I can connect you to KnaBa.',
  },
  uk: {
    welcome: 'Вітаю! Допоможу з питаннями щодо будівельного клінінгу та допоміжних робіт у Берліні та Бранденбурзі. Для узгодження ціни й термінів можу з’єднати з KnaBa.',
    handoff: 'Запит на розмову з власником збережено. KnaBa може відповісти тут у чаті. Збережіть розмову на цьому пристрої або скористайтеся телефоном чи email.',
    price: 'Ціна залежить від етапу будівництва, площі, доступу та обсягу робіт. Остаточну пропозицію узгоджує власник. Передати йому запит?',
    region: 'KnaBa приймає заявки на будівельний клінінг у Берліні та Бранденбурзі. Доступність конкретного об’єкта узгоджується окремо.',
    services: 'Основні послуги: будівельний клінінг, прибирання майданчика та допоміжні роботи. Буріння бетону й проходки узгоджуються після технічної перевірки та окремого договору. Який етап будівництва?',
    timing: 'Дата й графік погоджуються особисто. Я не можу підтвердити бронювання автоматично. Передати бажану дату власнику?',
    fallback: 'Підкажіть тип об’єкта та вид прибирання. Щоб погодити конкретні умови, я можу запросити власника KnaBa.',
  },
  ru: {
    welcome: 'Здравствуйте! Помогу с вопросами о строительном клининге и подсобных работах в Берлине и Бранденбурге. Для согласования цены и сроков могу связать с KnaBa.',
    handoff: 'Запрос на связь с владельцем сохранён. KnaBa может ответить прямо в этом чате. Сохраните диалог на устройстве или воспользуйтесь телефоном/email.',
    price: 'Цена зависит от стадии строительства, площади, доступа и согласованного объёма. Точное предложение согласовывает владелец. Передать ему запрос?',
    region: 'KnaBa принимает заявки на строительный клининг в Берлине и Бранденбурге. Возможность обслуживания объекта подтверждается отдельно.',
    services: 'Наш профиль: строительный клининг, подготовка площадок и вспомогательные работы. Бурение бетона и проходки — только после технической проверки и отдельного договора. Какой этап работ?',
    timing: 'Даты и график согласовываются индивидуально. Я не могу подтвердить запись автоматически. Передать предпочтительное время владельцу?',
    fallback: 'Подскажите тип объекта и нужную уборку. Для конкретных условий я могу подключить владельца KnaBa.',
  },
} satisfies Record<AssistantLocale, Record<string,string>>;

export function assistantGreeting(locale: AssistantLocale): string { return dictionary[locale].welcome; }
export function assistantAnswer(message: string, locale: AssistantLocale): {text:string; handoff:boolean} {
  const lower = message.toLowerCase();
  const text = dictionary[locale];
  if (/(?:\b(?:human|person|operator|manager|owner|mitarbeiter|chef|inhaber|mensch|besitzer|call|telefon)\b|людин|власник|оператор|менеджер|владел|человек|позвон|зв'яз|связат)/iu.test(lower))
    return {text:text.handoff,handoff:true};
  if (/(?:preis|kosten|angebot|quote|price|cost|€|eur|ціна|вартість|скільки|цен[аы]|стоимост|сколько)/iu.test(lower))
    return {text:text.price,handoff:false};
  if (/(?:berlin|brandenburg|region|where|area|берлін|берлин|бранденбург)/iu.test(lower))
    return {text:text.region,handoff:false};
  if (/(?:termin|wann|zeit|date|time|schedule|коли|час|дата|срок|когда|время)/iu.test(lower))
    return {text:text.timing,handoff:false};
  if (/(?:reinigung|cleaning|büro|fenster|treppen|bau|office|window|уборк|прибиран|клин|офіс|офис|окн|вікн|під'їзд)/iu.test(lower))
    return {text:text.services,handoff:false};
  return {text:text.fallback,handoff:false};
}