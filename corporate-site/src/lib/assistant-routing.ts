import type { AssistantAnswer, AssistantLocale } from './public-assistant';

/**
 * Public-only intent hints. This module cannot authenticate an employee or client,
 * submit a lead, commit an order, set a price or silently send a conversation.
 * The identity and authorization boundary remains the existing server portal.
 */
export type PublicIntent = 'safety' | 'human' | 'worker' | 'existing_client' | 'partner' | 'new_client';
export type AssistantRoute = { intent: PublicIntent; answer: AssistantAnswer };

const patterns: ReadonlyArray<readonly [PublicIntent, RegExp]> = [
  ['safety', /gefahr|verletzt|unfall|lebensgefahr|injur(?:ed|y)|accident|danger|emergency|опасност|травм|несчастн.{0,10}случ|пожар|пожеж|небезпек|травмован/iu],
  ['human', /(?:inhaber|geschäftsführ|mit.{0,15}mensch|mitarbeiter.{0,15}sprech|chef.{0,10}sprech|real person|human agent|speak.{0,16}(?:owner|person|manager)|connect.{0,16}owner|владельц|власник|соедин.{0,18}человек|оператор|жив.{0,8}людин)/iu],
  ['worker', /(?:ich bin.{0,15}mitarbeiter|arbeitszeit|stundenzettel|mein schicht|arbeiter.{0,18}(?:bericht|stund)|i am.{0,12}(?:worker|employee)|timesheet|employee report|my shift|я работник|я сотрудник|рабоч.{0,16}отч[её]т|мой табел|я працівник|робоч.{0,10}годин)/iu],
  ['existing_client', /(?:bestandskund|bestehend.{0,15}kunde|existing (?:client|customer)|current customer|already (?:a )?client|my (?:invoice|order)|я (?:уже |вже )?клиент|мой (?:заказ|счет)|поточн.{0,12}клієнт|мій рахунок)/iu],
  ['partner', /(?:subcontractor|subunternehm|partner(?:ship|schaft)?|zusammenarbeit|партн[её]р|субподряд|субпідряд|співпрац)/iu],
  ['new_client', /(?:angebot|anfrage|kostenvoranschlag|baureinigung|kernbohr|betonbohr|bauhilfe|quote|request a job|need cleaning|construction cleaning|drilling|строительн.{0,20}уборк|бурени.{0,15}бетон|бурения отверст|клинин|заявк|рассчита.{0,15}цен|вартіст.{0,12}роб|кошторис|прибирання.{0,15}будів)/iu],
];

const copy: Record<AssistantLocale, Record<PublicIntent, { text:string; label:string; href:string }>> = {
  de: {
    safety: {text:'Wenn jemand unmittelbar in Gefahr ist oder verletzt wurde, wählen Sie in Deutschland 112. Ich bin kein Notfalldienst. Informieren Sie anschließend die verantwortliche Bauleitung.',label:'Notruf 112',href:'tel:112'},
    human: {text:'Sie möchten mit dem KnaBa-Team sprechen. Schreiben Sie Ihre Nachricht im Formular „Kontakt mit dem Team“ unten. Sie wird erst nach Ihrer ausdrücklichen Bestätigung gesendet. Eine sofortige telefonische Verbindung ist hier nicht eingerichtet.',label:'Nachricht an das Team',href:'#knaba-owner-chat'},
    worker: {text:'Arbeitszeit, Objektberichte und interne Meldungen gehören ausschließlich in das geschützte Mitarbeiterportal. Eine Angabe „Ich bin Mitarbeiter“ in diesem Chat gibt keinen Zugriff frei.',label:'Geschütztes Portal',href:'/portal/'},
    existing_client: {text:'Bestehende Aufträge, Rechnungen und vertrauliche Daten sind nur nach Anmeldung im Kundenportal einsehbar. Für persönliche Unterstützung können Sie unten eine Nachricht senden.',label:'Zum Kundenportal',href:'/portal/'},
    partner: {text:'Vielen Dank für Ihr Interesse an einer Zusammenarbeit mit KnaBa. Beschreiben Sie Ihren Betrieb und die gewünschten Bau- oder Reinigungsleistungen über das Kontaktformular. Eine Partnerschaft wird nicht automatisch vereinbart.',label:'Kontaktformular öffnen',href:'/kontakt/'},
    new_client: {text:'Gern nehmen wir Ihre Anfrage zu Baureinigung, Bauhilfsarbeiten oder Kernbohrungen entgegen. Geben Sie bitte Einsatzort, Leistungsumfang und Wunschtermin im Kontaktformular an. Ein Preis oder Termin ist damit noch nicht bestätigt.',label:'Unverbindlich anfragen',href:'/kontakt/'},
  },
  en: {
    safety: {text:'If anyone is in immediate danger or injured in Germany, call 112. I am not an emergency service. Inform the responsible site manager afterwards.',label:'Emergency 112',href:'tel:112'},
    human: {text:'To contact the KnaBa team, use the message form below. Your message is sent only after you explicitly submit it. This assistant cannot connect a live phone call to the owner yet.',label:'Message the team',href:'#knaba-owner-chat'},
    worker: {text:'Timesheets, site reports and other employee information must be submitted through the authenticated worker portal. Saying you are an employee does not grant access.',label:'Secure portal',href:'/portal/'},
    existing_client: {text:'Existing jobs, invoices and private customer details require signing in to the client portal. You can also send a message to the team below.',label:'Client portal',href:'/portal/'},
    partner: {text:'Thank you for your interest in working with KnaBa. Please send your company details and proposed construction or cleaning cooperation through the enquiry form. No contract is created here.',label:'Contact KnaBa',href:'/en/kontakt/'},
    new_client: {text:'For construction cleaning, construction support or core drilling, please provide your site, scope and preferred date in our enquiry form. The team must confirm availability and pricing.',label:'Request a quote',href:'/en/kontakt/'},
  },
  ru: {
    safety: {text:'Если в Германии есть непосредственная опасность для жизни или кто-то получил травму, звоните 112. Я не экстренная служба. Затем сообщите ответственному руководителю объекта.',label:'Экстренная служба 112',href:'tel:112'},
    human: {text:'Чтобы связаться с командой KnaBa, воспользуйтесь формой сообщения ниже. Оно отправится только после вашего подтверждения. Прямое телефонное соединение с владельцем пока не подключено.',label:'Написать команде',href:'#knaba-owner-chat'},
    worker: {text:'Табель, отчёты с объектов и внутренние заявления подаются только через защищённый кабинет работника. Сообщение «я работник» не предоставляет права доступа.',label:'Защищённый кабинет',href:'/portal/'},
    existing_client: {text:'Данные действующих заказов и счетов доступны только после авторизации в клиентском кабинете. Также можно отправить сообщение команде ниже.',label:'Кабинет клиента',href:'/portal/'},
    partner: {text:'Спасибо за интерес к сотрудничеству с KnaBa. Опишите вашу компанию и предложение по строительным или клининговым работам в контактной форме. Договор автоматически не заключается.',label:'Связаться с KnaBa',href:'/ru/kontakt/'},
    new_client: {text:'Для строительного клининга, подсобных строительных работ или бурения отверстий заполните заявку: объект, объём работ и желаемая дата. Цены и сроки подтверждает команда.',label:'Оставить заявку',href:'/ru/kontakt/'},
  },
  uk: {
    safety: {text:'Якщо у Німеччині є безпосередня небезпека для життя або травмовано людину, телефонуйте 112. Я не екстрена служба. Після цього сповістіть керівника об’єкта.',label:'Допомога 112',href:'tel:112'},
    human: {text:'Щоб зв’язатися з командою KnaBa, скористайтеся формою повідомлення нижче. Воно надсилається лише після вашого підтвердження. Телефонне з’єднання з власником ще не підключено.',label:'Написати команді',href:'#knaba-owner-chat'},
    worker: {text:'Табелі, звіти з об’єктів та внутрішні звернення надсилайте лише через захищений кабінет працівника. Повідомлення «я працівник» не дає доступу.',label:'Захищений кабінет',href:'/portal/'},
    existing_client: {text:'Дані замовлень і рахунків доступні після входу до кабінету клієнта. Також можете написати команді нижче.',label:'Кабінет клієнта',href:'/portal/'},
    partner: {text:'Дякуємо за інтерес до співпраці з KnaBa. Розкажіть про компанію та запропоновані послуги через форму звернення. Договір автоматично не укладається.',label:'Зв’язатися з KnaBa',href:'/kontakt/'},
    new_client: {text:'Для будівельного клінінгу, допоміжних будівельних робіт або буріння отворів надішліть заявку з описом об’єкта, обсягу й бажаної дати. Ціну та терміни підтверджує команда.',label:'Подати заявку',href:'/kontakt/'},
  },
};

export function routeAssistantQuestion(raw: string, locale: AssistantLocale): AssistantRoute | null {
  if (!raw.trim() || raw.length > 500) return null;
  const normalized = raw.normalize('NFKC').toLocaleLowerCase();
  const match = patterns.find(([,pattern]) => pattern.test(normalized));
  if (!match) return null;
  const intent = match[0];
  const item = copy[locale][intent];
  return {intent,answer:{text:item.text,links:[{label:item.label,href:item.href}]}};
}

/** Role buttons are only public navigation shortcuts; they never grant portal privileges. */
export function routeAssistantSelection(intent:PublicIntent,locale:AssistantLocale):AssistantRoute {
  const item=copy[locale][intent];
  return {intent,answer:{text:item.text,links:[{label:item.label,href:item.href}]}};
}
