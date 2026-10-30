import {plUI,ltUI,extraOfferNames,extraOfferDescriptions} from './public-extra-locales.ts';
import {enUI,ukUI} from './construction-ui-translations.ts';
import { ruServices } from '../data/ru-services.ts';
import type { Service } from '../data/company.ts';

export type PublicLocale = 'de' | 'en' | 'pl' | 'lt' | 'ru' | 'uk';
const ru: Record<string, string> = {
  'Projektanfrage':'Заявка по проекту','Projektanfrage:':'Заявка по проекту:','Welche Leistung benötigen Sie?':'Какая услуга вам нужна?','ich möchte folgenden Bedarf mit Ihnen besprechen:':'Я хочу обсудить с вами следующие работы:',
  'Gewerbebau & Sanierung':'Коммерческое строительство и реконструкция',
  'Wohnbau & Modernisierung':'Жилищное строительство и модернизация',
  'Neubau & Baustelle':'Новостройка и стройплощадка',
  'Technik & Leitungen':'Техника и коммуникации',
  'Bauzwischenreinigung':'Промежуточная уборка',
  'Baufeinreinigung':'Тонкая уборка',
  'Baustellenberäumung':'Расчистка стройплощадки',
  'Bauendreinigung':'Финальная уборка',

  'Ihr Browser unterstützt keine sichere Anfragekennung. Bitte nutzen Sie einen aktuellen Browser oder kontaktieren Sie KnaBa direkt.':'Ваш браузер не поддерживает безопасный идентификатор заявки. Используйте современный браузер или свяжитесь с KnaBa напрямую.',
  'Leistung':'Услуга','Objekt':'Объект','Kontakt':'Контакты',
  'Büro / Gewerbe':'Офис / коммерческое помещение','Wohngebäude / Treppenhaus':'Жилое здание / подъезд','Baustelle':'Стройплощадка','Bildung / Betreuung':'Образование / уход','Anderes Objekt':'Другой объект',
  'Einmalig':'Разово','Regelmäßig':'Регулярно','Noch offen':'Пока не определено',
  'Bitte wählen Sie eine Leistung.':'Выберите услугу.','Bitte wählen Sie die Objektart.':'Выберите тип объекта.','Bitte geben Sie eine fünfstellige Postleitzahl an.':'Введите почтовый индекс из пяти цифр.',
  'Bitte geben Sie eine Fläche zwischen 1 und 1.000.000 m² an oder lassen Sie das Feld frei.':'Укажите площадь от 1 до 1 000 000 м² или оставьте поле пустым.',
  'Bitte wählen Sie die gewünschte Häufigkeit.':'Выберите желаемую периодичность.','Bitte geben Sie Ihren Namen an (maximal 80 Zeichen).':'Укажите ваше имя (не более 80 символов).','Bitte geben Sie eine gültige E-Mail-Adresse an.':'Введите действительный адрес электронной почты.','Bitte prüfen Sie Ihre Telefonnummer.':'Проверьте номер телефона.','Die Nachricht darf maximal 500 Zeichen enthalten.':'Сообщение должно содержать не более 500 символов.',
  'Bitte prüfen Sie Ihre Angaben.':'Проверьте введённые данные.','Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.':'Подтвердите, что вы ознакомились с информацией о защите данных.',
  'Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.':'Не удалось сохранить заявку. Повторите попытку.','Die Eingangsbestätigung fehlt. Bitte versuchen Sie es erneut.':'Подтверждение получения отсутствует. Повторите попытку.',
  'Ihre Anfrage ist bei KnaBa eingegangen. Dies ist noch keine Termin- oder Auftragsbestätigung.':'KnaBa получила вашу заявку. Это ещё не подтверждение даты или заказа.',
  'Die Verbindung hat zu lange gedauert. Sie können mit derselben Anfrage erneut versuchen oder uns direkt kontaktieren.':'Время ожидания истекло. Вы можете повторить отправку той же заявки или связаться с нами напрямую.',
  'Anfrage kopiert. Fügen Sie den Text in eine E-Mail an kontakt@knaba.de ein. Noch nicht gesendet.':'Заявка скопирована. Вставьте текст в письмо на kontakt@knaba.de. Письмо ещё не отправлено.',
  'Automatisches Kopieren ist hier nicht verfügbar. Der Text ist markiert: Bitte kopieren Sie ihn über das Menü Ihres Geräts.':'Автоматическое копирование недоступно. Текст выделен: скопируйте его через меню вашего устройства.',
  'Reinigungsanfrage':'Заявка на уборку','Schritte der Anfrage':'Этапы заявки','Vielen Dank für Ihre Anfrage.':'Спасибо за вашу заявку.','Ihre Anfrage im Überblick.':'Проверьте вашу заявку.',
  'Welche Reinigung benötigen Sie?':'Какая уборка вам нужна?','Erzählen Sie uns von Ihrem Objekt.':'Расскажите о вашем объекте.','Wie können wir Sie erreichen?':'Как с вами связаться?',
  'Bitte prüfen Sie Ihre Angaben. Mit „Anfrage senden“ übermitteln Sie diese direkt an KnaBa.':'Проверьте данные. Нажав «Отправить заявку», вы передадите их напрямую в KnaBa.',
  'Anfrage eingegangen':'Заявка получена','Ihre Vorgangsnummer:':'Номер вашей заявки:','Wir prüfen Ihren Bedarf. Ein Termin und ein Auftrag entstehen erst nach persönlicher Vereinbarung.':'Мы рассмотрим ваши потребности. Дата и заказ подтверждаются только после личного согласования.','Bei Rückfragen erreichen Sie uns unter':'Если у вас есть вопросы, позвоните нам:',
  'Ihre Angaben zum Prüfen und Kopieren':'Ваши данные для проверки и копирования','Empfänger:':'Получатель:', '. Alternativ können Sie Ihre Anfrage telefonisch oder per E-Mail besprechen.':'. Вы также можете обсудить заявку по телефону или электронной почте.',
  'Ich habe die':'Я ознакомился(-ась) с','Datenschutzhinweise':'информацией о защите данных','gelesen. Meine Angaben werden zur Bearbeitung der Anfrage gespeichert.':'Мои данные будут сохранены для обработки заявки.',
  'Wird gesendet …':'Отправка…','Anfrage senden →':'Отправить заявку →','Angaben bearbeiten':'Изменить данные','Zum Kundenportal →':'В личный кабинет →','Im E-Mail-Programm öffnen ↗':'Открыть в почтовой программе ↗','Anfrage kopieren':'Скопировать заявку',
  'Gewünschte Leistung':'Нужная услуга','Bitte auswählen':'Выберите вариант','Wählen Sie die Leistung, die am besten zu Ihrem Bedarf passt. Weitere Wünsche können Sie im letzten Schritt ergänzen.':'Выберите услугу, которая лучше всего соответствует вашим потребностям. Дополнительные пожелания можно указать на последнем этапе.',
  'Objektart':'Тип объекта','Postleitzahl des Objekts':'Почтовый индекс объекта','Fünf Ziffern, z. B. 10315.':'Пять цифр, например 10315.','Fläche in m²':'Площадь в м²','(optional)':'(необязательно)','Eine Schätzung genügt.':'Достаточно приблизительной площади.','Häufigkeit':'Периодичность','Ihr Name':'Ваше имя','E-Mail':'Электронная почта','Telefon':'Телефон','Ihre Nachricht':'Ваше сообщение',
  'Zum Beispiel Wunschtermin, Zugangszeiten oder besondere Anforderungen.':'Например, желаемая дата, время доступа или особые требования.','Zeichen. Bitte keine sensiblen Daten eintragen.':'символов. Не указывайте конфиденциальные данные.',
  'Im nächsten Schritt prüfen Sie Ihre Anfrage und senden sie direkt an KnaBa. Eine Registrierung ist dafür nicht erforderlich. Informationen zur Verarbeitung finden Sie unter':'На следующем этапе вы проверите заявку и отправите её напрямую в KnaBa. Регистрация не требуется. Описание обработки данных доступно в разделе',
  'Datenschutz':'Защита данных','← Zurück':'← Назад','Anfrage prüfen →':'Проверить заявку →','Weiter →':'Далее →','* Pflichtfelder. Noch keine Beauftragung.':'* Обязательные поля. Заявка ещё не является заказом.',
  'An':'Кому','Betreff':'Тема','Reinigungsanfrage:':'Заявка на уборку:','Guten Tag KnaBa,':'Здравствуйте, KnaBa!', 'ich möchte folgenden Reinigungsbedarf mit Ihnen besprechen:':'Я хочу обсудить с вами следующие услуги по уборке:',
  'Postleitzahl':'Почтовый индекс','Ungefähre Fläche':'Приблизительная площадь','Name':'Имя','Nicht angegeben':'Не указано','Nachricht':'Сообщение','Weitere Details besprechen wir gern persönlich.':'Дополнительные детали обсудим лично.','Bitte kontaktieren Sie mich zur Abstimmung. Vielen Dank!':'Пожалуйста, свяжитесь со мной для согласования. Спасибо!',
  'Die Anfrage ist für das E-Mail-Programm zu lang. Bitte kürzen Sie die Nachricht oder kontaktieren Sie uns direkt.':'Заявка слишком длинная для почтовой программы. Сократите сообщение или свяжитесь с нами напрямую.',
  'PASSENDE LEISTUNG FINDEN':'ПОДОБРАТЬ УСЛУГУ','Was braucht Ihr Objekt?':'Что нужно вашему объекту?','Zwei Angaben helfen bei der Orientierung. Den genauen Umfang stimmen wir persönlich ab.':'Два ответа помогут подобрать услугу. Точный объём работ согласуем лично.','Ihr Objekt':'Ваш объект','Ihr Schwerpunkt':'Главная задача',
  'Büro & Gewerbe':'Офис и коммерция','Wohnimmobilie':'Жилая недвижимость','Bauprojekt':'Строительный объект','Bildung & Betreuung':'Образование и уход','Laufende Pflege':'Регулярная уборка','Fenster & Fassade':'Окна и фасад','Gründliche Reinigung':'Тщательная уборка','Nach Bauarbeiten':'После строительных работ',
  'UNSERE ORIENTIERUNGSHILFE':'НАША РЕКОМЕНДАЦИЯ','Im Plan ausgewählt ✓':'Выбрано для плана ✓','Für meinen Plan auswählen →':'Выбрать для моего плана →','Leistung im Detail ansehen ↗':'Подробнее об услуге ↗','Nur eine Orientierungshilfe. Keine automatische Buchung und keine Preiszusage.':'Это предварительная рекомендация. Она не является бронированием или подтверждением цены.',
  'GUT VORBEREITET ANFRAGEN':'ПОДГОТОВИТЬ ЗАЯВКУ','Ihr Reinigungsplan.':'Ваш план уборки.','Eine kleine Merkliste für das erste Gespräch.':'Краткий список для подготовки к первому разговору.','AUSGEWÄHLTE LEISTUNG':'ВЫБРАННАЯ УСЛУГА','Diese Angaben können Sie vorbereiten':'Подготовьте следующие сведения','Zurücksetzen':'Сбросить','Vorbereitete Angaben':'Подготовленные сведения','Mit dieser Leistung anfragen →':'Отправить заявку на эту услугу →',
  'Die Leistung wird in die Anfrage übernommen. Häkchen bleiben nur auf dieser Seite und werden nicht übertragen. Sie können auch ohne vollständige Merkliste anfragen.':'Выбранная услуга будет перенесена в заявку. Отметки сохраняются только на этой странице и не передаются. Заявку можно отправить и без заполнения всего списка.',
  'ODER DIREKT AUSWÄHLEN':'ИЛИ ВЫБЕРИТЕ НАПРЯМУЮ','Alle Leistungen im Überblick.':'Все услуги.','Zu den Leistungsseiten ↗':'Перейти к услугам ↗','Wählen Sie eine Leistung für Ihren Plan. Umfang und Verfügbarkeit klären wir gemeinsam für Ihr Objekt.':'Выберите услугу для вашего плана. Объём и возможность выполнения согласуем с учётом объекта.',
  'Leistungskatalog wird geladen …':'Загрузка каталога услуг…','Der Leistungskatalog konnte nicht geladen werden. Prüfen Sie Ihre Verbindung oder nutzen Sie die Leistungsseiten.':'Не удалось загрузить каталог услуг. Проверьте соединение или откройте страницы услуг.','Wird geladen …':'Загрузка…','Erneut laden':'Загрузить снова','Katalog wird aktualisiert …':'Каталог обновляется…','Die interaktive Auswahl benötigt JavaScript. Alle Leistungen sind über die Leistungsseiten erreichbar.':'Для интерактивного выбора нужен JavaScript. Все услуги доступны на отдельных страницах.',
};

export function publicText(text: string, locale: PublicLocale = 'de'): string {
  return locale === 'pl' ? (plUI[text] ?? text) : locale === 'lt' ? (ltUI[text] ?? text) : locale === 'ru' ? (ru[text] ?? text) : locale === 'en' ? (enUI[text] ?? text) : locale === 'uk' ? (ukUI[text] ?? text) : text;
}

export function localizedService<T extends {slug: Service['slug']; name: string; description: string}>(service: T, locale: PublicLocale = 'de'): T {
  if(service.slug === 'baureinigung' && locale !== 'de'){
    const names={pl:'Sprzątanie budowlane',lt:'Statybų valymas',en:'Construction cleaning',uk:'Будівельний клінінг',ru:'Строительный клининг'};
    const descriptions={pl:'Sprzątanie wstępne, między etapami, dokładne i końcowe na budowie.',lt:'Pirminis, tarpinis, kruopštus ir galutinis statybų valymas.',en:'Rough, interim, fine and final cleaning on construction sites.',uk:'Грубе, міжетапне, тонке і фінальне прибирання будівельних об’єктів.',ru:'Черновая, промежуточная, тонкая и финальная уборка стройплощадок.'};
    return {...service,name:names[locale],description:descriptions[locale]} as T;
  }
  return locale === 'ru' ? {...service,...ruServices[service.slug]} as T : service;
}

export function publicOfferName(offer: {slug:string;name:Record<'de'|'en'|'uk'|'ru',string>}, locale:PublicLocale):string {
  return locale==='pl'||locale==='lt' ? extraOfferNames[locale][offer.slug] ?? offer.name.de : offer.name[locale];
}

export function publicOfferDescription(offer: {slug:string;description:Record<'de'|'en'|'uk'|'ru',string>},locale:PublicLocale):string {
 return locale==='pl'||locale==='lt'?extraOfferDescriptions[locale][offer.slug]??offer.description.de:offer.description[locale];
}

export function publicApiError(code: unknown, locale: PublicLocale, fallback: string): string {
  if (locale === 'pl' || locale === 'lt') {
    const errorMessages = {
      pl:{rate_limit:'Zbyt wiele zapytań. Poczekaj i spróbuj ponownie.',privacy:'Potwierdź zapoznanie się z informacją o ochronie danych.',validation:'Sprawdź wymagane pola i poprawność danych.',unavailable:'Usługa jest chwilowo niedostępna. Spróbuj później.',origin:'Nie udało się potwierdzić zapytania. Odśwież stronę i spróbuj ponownie.',idempotency:'Identyfikator zapytania jest nieprawidłowy. Odśwież stronę.',idempotency_conflict:'Ten identyfikator dotyczy innego zapytania. Najpierw sprawdź zapisane zgłoszenia.',body_size:'Zapytanie jest za duże. Skróć wiadomość.'},
      lt:{rate_limit:'Per daug užklausų. Palaukite ir bandykite dar kartą.',privacy:'Patvirtinkite, kad perskaitėte privatumo pranešimą.',validation:'Patikrinkite privalomus laukus ir duomenų teisingumą.',unavailable:'Paslauga laikinai nepasiekiama. Bandykite vėliau.',origin:'Nepavyko patvirtinti užklausos. Atnaujinkite puslapį ir bandykite dar kartą.',idempotency:'Netinkamas užklausos identifikatorius. Atnaujinkite puslapį.',idempotency_conflict:'Šis identifikatorius priklauso kitai užklausai. Pirmiausia patikrinkite išsaugotas užklausas.',body_size:'Užklausa per didelė. Sutrumpinkite žinutę.'},
    }[locale];
    return typeof code==='string' && Object.hasOwn(errorMessages,code) ? errorMessages[code as keyof typeof errorMessages] : publicText('Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',locale);
  }
  if (locale !== 'ru') return publicText(fallback,locale);
  const messages: Record<string, string> = {
    rate_limit: 'Слишком много заявок. Повторите попытку позже или позвоните нам.',
    privacy: 'Подтвердите, что вы ознакомились с информацией о защите данных.',
    validation: 'Проверьте обязательные поля и правильность введённых данных.',
    unavailable: 'Сервис временно недоступен. Повторите попытку позже.',
    origin: 'Не удалось подтвердить запрос. Обновите страницу и повторите попытку.',
    idempotency: 'Идентификатор заявки недействителен. Обновите страницу.',
    idempotency_conflict: 'Этот идентификатор относится к другой заявке. Сначала проверьте сохранённые заявки.',
    body_size: 'Заявка слишком большая. Сократите сообщение.',
  };
  return typeof code === 'string' && messages[code] ? messages[code] : 'Не удалось сохранить заявку. Повторите попытку или свяжитесь с нами напрямую.';
}
