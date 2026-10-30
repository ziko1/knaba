export type ReviewLocale = 'de' | 'en' | 'uk' | 'ru';
export type PublicReview = {
  id: string; displayName: string; company: string; relationship: 'client' | 'partner';
  text: string; createdAt: string;
};
export type ManagedReview = PublicReview & {
  email: string; consentAt: string; status: 'pending' | 'published' | 'hidden'; version: number;
};

// Editorial examples, never API records, customer identities or rating evidence.
// Keep this model separate from PublicReview and never seed it into the database.
export const reviewExamples = {
  de: {
    title: 'So könnte eine Rückmeldung aussehen',
    disclosure: 'Die folgenden Texte sind frei erfundene Beispiele. Sie stammen nicht von Kunden und belegen keine ausgeführten Aufträge.',
    badge: 'Beispiel · frei erfunden',
    items: [
      {topic: 'Reinigung vor der Übergabe', text: 'Vor der Übergabe war noch ziemlich viel Baustaub in den Räumen. Wir haben vorher besprochen, welche Flächen gereinigt werden sollen und was noch nicht fertig ist. Gut fand ich, dass wir zum Schluss gemeinsam durchgegangen sind und offene Punkte direkt klären konnten.'},
      {topic: 'Abstimmung auf der Baustelle', text: 'Bei uns waren noch mehrere Gewerke gleichzeitig vor Ort. Deshalb war mir wichtig, dass die Reinigung zum Bauablauf passt. Die Bereiche und Zugangszeiten vorher abzusprechen hat geholfen. Eine Änderung im Ablauf konnten wir kurz am Telefon klären.'},
      {topic: 'Unterstützung bei der Vorbereitung', text: 'Wir brauchten Hilfe beim Vorbereiten und Freiräumen einzelner Bereiche. Vor dem Einsatz wurde geklärt, was dazugehört und was nicht. Das hat die Abstimmung für mich einfacher gemacht. Beim nächsten Mal würde ich die Fotos und Maße gleich mit der Anfrage schicken.'},
    ],
  },
  en: {
    title: 'What feedback could look like',
    disclosure: 'The following texts are fictional examples. They are not customer reviews and do not document completed projects.',
    badge: 'Example · fictional text',
    items: [
      {topic: 'Cleaning before handover', text: 'There was still quite a bit of building dust before the handover. We talked through which areas needed cleaning and which were still being worked on. I appreciated walking through together at the end so we could clear up any remaining points.'},
      {topic: 'Coordinating work on site', text: 'We still had several trades working on site, so the cleaning had to fit around them. Agreeing the areas and access times beforehand helped. When the schedule changed, we sorted it out with a quick phone call.'},
      {topic: 'Help preparing the site', text: 'We needed help preparing and clearing a few areas. Before the visit, we agreed what was included and what was outside the scope. That made coordination easier for me. Next time I would send photos and measurements with the first enquiry.'},
    ],
  },
  uk: {
    title: 'Як може виглядати відгук',
    disclosure: 'Нижче — вигадані приклади текстів. Це не відгуки клієнтів і не підтвердження виконаних замовлень.',
    badge: 'Приклад відгуку · вигаданий текст',
    items: [
      {topic: 'Прибирання перед здачею', text: 'Перед здачею в приміщеннях ще було чимало будівельного пилу. Заздалегідь обговорили, що потрібно прибрати, а де роботи ще тривають. Сподобалося, що наприкінці разом пройшлися об’єктом і одразу з’ясували всі питання.'},
      {topic: 'Узгодження робіт на об’єкті', text: 'На об’єкті одночасно працювали кілька бригад, тому прибирання треба було вписати в загальний графік. Допомогло те, що заздалегідь узгодили зони й час доступу. Коли графік трохи змінився, домовилися коротким дзвінком.'},
      {topic: 'Допомога з підготовкою', text: 'Потрібна була допомога з підготовкою та звільненням окремих ділянок. До початку уточнили, що входить у роботи, а що ні. Мені так було простіше все організувати. Наступного разу одразу додам до запиту фото й розміри — це зекономить час на уточненнях.'},
    ],
  },
  ru: {
    title: 'Как может выглядеть отзыв',
    disclosure: 'Ниже — вымышленные примеры текстов. Это не отзывы клиентов и не подтверждение выполненных заказов.',
    badge: 'Пример отзыва · вымышленный текст',
    items: [
      {topic: 'Уборка перед сдачей', text: 'Перед сдачей в помещениях ещё было немало строительной пыли. Заранее обсудили, что нужно убрать, а где работы пока продолжаются. Понравилось, что в конце вместе прошли по объекту и сразу разобрали оставшиеся вопросы.'},
      {topic: 'Согласование работ на объекте', text: 'На объекте одновременно работали несколько бригад, поэтому уборку нужно было вписать в общий график. Помогло то, что заранее согласовали зоны и время доступа. Когда график немного изменился, договорились коротким звонком.'},
      {topic: 'Помощь с подготовкой', text: 'Нужна была помощь с подготовкой и освобождением отдельных участков. До начала уточнили, что входит в работы, а что нет. Мне так было проще всё организовать. В следующий раз сразу приложу к запросу фото и размеры — будет меньше уточнений.'},
    ],
  },
} as const satisfies Record<ReviewLocale, {title: string; disclosure: string; badge: string; items: readonly {topic: string; text: string}[]}>;

export const reviewsCopy = {
  de: {
    label: 'ERFAHRUNGEN / ZUSAMMENARBEIT', title: 'Rückmeldungen zur Zusammenarbeit.',
    intro: 'Ihre Erfahrung mit KnaBa zählt. Teilen Sie, wie die Zusammenarbeit an Ihrem Projekt verlaufen ist.',
    loading: 'Rückmeldungen werden geladen …', empty: 'Hier ist Platz für Ihre Erfahrung.',
    emptyText: 'Auf dieser Website sind noch keine Rückmeldungen veröffentlicht. Haben Sie mit KnaBa zusammengearbeitet? Wir freuen uns über Ihren Bericht.',
    loadError: 'Die Rückmeldungen können gerade nicht geladen werden.', retry: 'Erneut versuchen',
    write: 'Erfahrung teilen', close: 'Formular schließen', formTitle: 'Ihre Rückmeldung an KnaBa',
    formIntro: 'Bitte berichten Sie nur über eine eigene Zusammenarbeit. Jede Rückmeldung wird vor der Veröffentlichung geprüft.',
    displayName: 'Öffentlicher Name', email: 'E-Mail (nicht öffentlich)', company: 'Unternehmen (optional, öffentlich)',
    relationship: 'Ihre Zusammenarbeit mit KnaBa', client: 'Kunde / Kundin', partner: 'Partner / Partnerin',
    text: 'Ihre Erfahrung', textHelp: '20–1.200 Zeichen. Bitte keine vertraulichen Projektinformationen oder persönlichen Daten Dritter nennen.',
    consent: 'Ich bin mit der Veröffentlichung meines Namens, meines Unternehmens (falls angegeben), meiner Rolle und meiner Rückmeldung auf dieser Website einverstanden. Meine E-Mail-Adresse wird nicht veröffentlicht.',
    privacy: 'Datenschutzhinweise', privacyNote: 'Die E-Mail dient Rückfragen zur Rückmeldung. Für den Widerruf der Veröffentlichung kontaktieren Sie KnaBa.',
    contact: 'Kontakt', send: 'Zur Prüfung senden', sending: 'Wird gesendet …', success: 'Danke! Ihre Rückmeldung wurde zur Prüfung eingereicht. Sie ist noch nicht veröffentlicht.',
    sendError: 'Die Übermittlung konnte nicht bestätigt werden. Ihre Angaben bleiben erhalten. Versuchen Sie es erneut.',
    invalid: 'Bitte prüfen Sie Ihre Angaben und bestätigen Sie die Veröffentlichung.', captchaError: 'Bitte schließen Sie die Sicherheitsprüfung ab.',
    rateError: 'Zu viele Versuche. Bitte versuchen Sie es später erneut.', conflictError: 'Diese Anfragekennung ist bereits vergeben. Bitte laden Sie die Seite neu und prüfen Sie Ihre Angaben.',
    recent: 'Angezeigt werden die neuesten veröffentlichten Rückmeldungen.', roleNote: 'Rollenangaben stammen von den Verfassenden.', noScript: 'Zum Laden und Einreichen von Rückmeldungen benötigen Sie JavaScript. Sie erreichen uns auch über die Kontaktseite.',
  },
  en: {
    label: 'EXPERIENCES / WORKING TOGETHER', title: 'Feedback on working together.',
    intro: 'Your experience with KnaBa matters. Tell us how working together on your project went.',
    loading: 'Loading feedback …', empty: 'Your experience belongs here.',
    emptyText: 'No feedback has been published on this website yet. Have you worked with KnaBa? We would welcome your account.',
    loadError: 'Feedback could not be loaded right now.', retry: 'Try again',
    write: 'Share your experience', close: 'Close form', formTitle: 'Your feedback for KnaBa',
    formIntro: 'Please describe your own experience of working with us. Every submission is reviewed before publication.',
    displayName: 'Public name', email: 'Email (private)', company: 'Company (optional, public)',
    relationship: 'Your relationship with KnaBa', client: 'Customer', partner: 'Partner',
    text: 'Your experience', textHelp: '20–1,200 characters. Please do not include confidential project information or other people’s personal details.',
    consent: 'I agree to the publication of my name, company (if provided), role and feedback on this website. My email address will not be published.',
    privacy: 'Privacy notice (DE)', privacyNote: 'Your email is used for questions about your feedback. Contact KnaBa to withdraw consent to publication.',
    contact: 'Contact', send: 'Submit for review', sending: 'Sending …', success: 'Thank you! Your feedback has been submitted for review. It is not published yet.',
    sendError: 'We could not confirm receipt. Your entries have been kept. Please try again.',
    invalid: 'Please check your entries and agree to publication.', captchaError: 'Please complete the security check.',
    rateError: 'Too many attempts. Please try again later.', conflictError: 'This request identifier has already been used. Please reload the page and check your entries.',
    recent: 'Showing the latest published feedback.', roleNote: 'Roles are provided by the authors.', noScript: 'JavaScript is needed to load and submit feedback. You can also reach us through the contact page.',
  },
  uk: {
    label: 'ДОСВІД / СПІВПРАЦЯ', title: 'Відгуки про співпрацю.',
    intro: 'Ваш досвід роботи з KnaBa важливий. Розкажіть, як пройшла співпраця на вашому об’єкті.',
    loading: 'Завантажуємо відгуки …', empty: 'Тут може бути ваш відгук.',
    emptyText: 'На цьому сайті опублікованих відгуків поки немає. Ви вже працювали з KnaBa? Будемо раді почути про ваш досвід.',
    loadError: 'Зараз не вдалося завантажити відгуки.', retry: 'Спробувати ще',
    write: 'Поділитися досвідом', close: 'Закрити форму', formTitle: 'Ваш відгук про KnaBa',
    formIntro: 'Розкажіть про власний досвід співпраці. Перед публікацією кожен відгук проходить перевірку.',
    displayName: 'Ім’я для публікації', email: 'Електронна пошта (приватна)', company: 'Компанія (необов’язково, публічно)',
    relationship: 'Ваша співпраця з KnaBa', client: 'Клієнт / клієнтка', partner: 'Партнер / партнерка',
    text: 'Ваш досвід', textHelp: '20–1 200 символів. Не вказуйте конфіденційні дані проєкту або персональні дані інших людей.',
    consent: 'Я погоджуюся на публікацію мого імені, компанії (якщо вказана), ролі та відгуку на цьому сайті. Моя електронна пошта не публікуватиметься.',
    privacy: 'Конфіденційність (DE)', privacyNote: 'Пошта потрібна для уточнень щодо відгуку. Щоб відкликати згоду на публікацію, зверніться до KnaBa.',
    contact: 'Контакти', send: 'Надіслати на перевірку', sending: 'Надсилаємо …', success: 'Дякуємо! Відгук надіслано на перевірку. Його ще не опубліковано.',
    sendError: 'Не вдалося підтвердити отримання. Введені дані збережено у формі. Спробуйте ще раз.',
    invalid: 'Перевірте дані й підтвердьте згоду на публікацію.', captchaError: 'Завершіть перевірку безпеки.',
    rateError: 'Забагато спроб. Спробуйте пізніше.', conflictError: 'Цей ідентифікатор запиту вже використано. Оновіть сторінку й перевірте введені дані.',
    recent: 'Показано останні опубліковані відгуки.', roleNote: 'Ролі зазначено авторами відгуків.', noScript: 'Для завантаження й надсилання відгуків потрібен JavaScript. Ви також можете звернутися через сторінку контактів.',
  },
  ru: {
    label: 'ОПЫТ / СОТРУДНИЧЕСТВО', title: 'Отзывы о сотрудничестве.',
    intro: 'Ваш опыт работы с KnaBa важен. Расскажите, как прошло сотрудничество на вашем объекте.',
    loading: 'Загружаем отзывы …', empty: 'Здесь может быть ваш отзыв.',
    emptyText: 'На этом сайте опубликованных отзывов пока нет. Вы уже работали с KnaBa? Будем рады узнать о вашем опыте.',
    loadError: 'Сейчас не удалось загрузить отзывы.', retry: 'Повторить',
    write: 'Поделиться опытом', close: 'Закрыть форму', formTitle: 'Ваш отзыв о KnaBa',
    formIntro: 'Расскажите о собственном опыте сотрудничества. Перед публикацией каждый отзыв проходит проверку.',
    displayName: 'Имя для публикации', email: 'Электронная почта (приватная)', company: 'Компания (необязательно, публично)',
    relationship: 'Ваше сотрудничество с KnaBa', client: 'Клиент / клиентка', partner: 'Партнёр / партнёрша',
    text: 'Ваш опыт', textHelp: '20–1 200 символов. Не указывайте конфиденциальные данные проекта или персональные данные других людей.',
    consent: 'Я согласен / согласна на публикацию моего имени, компании (если указана), роли и отзыва на этом сайте. Моя электронная почта не будет опубликована.',
    privacy: 'Конфиденциальность', privacyNote: 'Почта нужна для уточнений по отзыву. Чтобы отозвать согласие на публикацию, обратитесь в KnaBa.',
    contact: 'Контакты', send: 'Отправить на проверку', sending: 'Отправляем …', success: 'Спасибо! Отзыв отправлен на проверку. Он ещё не опубликован.',
    sendError: 'Не удалось подтвердить получение. Введённые данные сохранены в форме. Попробуйте ещё раз.',
    invalid: 'Проверьте данные и подтвердите согласие на публикацию.', captchaError: 'Завершите проверку безопасности.',
    rateError: 'Слишком много попыток. Попробуйте позже.', conflictError: 'Этот идентификатор запроса уже использован. Обновите страницу и проверьте введённые данные.',
    recent: 'Показаны последние опубликованные отзывы.', roleNote: 'Роли указаны авторами отзывов.', noScript: 'Для загрузки и отправки отзывов нужен JavaScript. Вы также можете обратиться через страницу контактов.',
  },
} as const;

export function reviewDate(value: string, locale: ReviewLocale): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(locale === 'uk' ? 'uk-UA' : locale, {year:'numeric',month:'short',day:'numeric'});
}
