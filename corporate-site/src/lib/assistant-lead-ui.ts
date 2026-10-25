import type { AssistantLocale } from './assistant-knowledge';
import type { ErpLeadView } from './assistant-erp-contract';

export function leadActions(lead: ErpLeadView | null | undefined, now: number) {
  const state = lead?.state;
  return {
    edit: !lead || state === 'DRAFT' || state === 'CANCELLED',
    confirm: !!lead && state === 'DRAFT' && !lead.cancelRequested && lead.expiresAt > now,
    cancel: !!lead && !lead.cancelRequested && ['DRAFT','QUEUED','SENDING','RETRY','BLOCKED'].includes(lead.state),
    expired: !!lead && state === 'DRAFT' && lead.expiresAt <= now,
  };
}

type Copy = {
  title:string;intro:string;name:string;email:string;phone:string;contactHint:string;service:string;choose:string;
  condition:string;period:string;optional:string;preview:string;review:string;confirm:string;consent:string;
  edit:string;cancel:string;cancelPending:string;refresh:string;required:string;privacy:string;failure:string;
  changed:string;expired:string;newConversation:string;ownerTitle:string;states:Record<ErpLeadView['state'],string>;
};
export const leadCopy: Record<AssistantLocale,Copy> = {
  de: {
    title:'Anfrage vorbereiten',intro:'Senden Sie eine strukturierte Anfrage an KnaBa. Prüfen und bestätigen Sie die Angaben vor dem Versand.',
    name:'Name',email:'E-Mail',phone:'Telefon',contactHint:'Bitte E-Mail oder Telefonnummer angeben.',service:'Leistung',choose:'Leistung auswählen',condition:'Zustand / Bedarf',period:'Gewünschter Zeitraum',optional:'optional',
    preview:'Angaben prüfen',review:'Ihre Anfrage vor dem Versand',confirm:'Anfrage bestätigen und senden',consent:'Ich habe die Angaben geprüft und möchte diese Anfrage an KnaBa zur Bearbeitung übermitteln.',
    edit:'Angaben ändern',cancel:'Übermittlung zurücknehmen',cancelPending:'Die Rücknahme wird geprüft. Eine bereits begonnene Übermittlung lässt sich nicht sicher zurückrufen.',refresh:'Status aktualisieren',
    required:'Bitte Namen, eine Kontaktmöglichkeit und eine Leistung angeben.',privacy:'Bestätigen Sie oben die Datenschutzhinweise und schließen Sie gegebenenfalls die Sicherheitsprüfung ab.',failure:'Die Aktion konnte nicht bestätigt werden. Aktualisieren Sie den Status, bevor Sie es erneut versuchen.',changed:'Die Angaben oder Freigabe haben sich geändert. Bitte den aktuellen Status laden und die Anfrage erneut prüfen.',expired:'Diese Vorschau ist abgelaufen. Bitte Angaben ändern und erneut prüfen.',newConversation:'Für eine weitere Anfrage beginnen Sie ein neues Gespräch. Eine Annahme verbindet Sie noch nicht mit einem Mitarbeiter.',ownerTitle:'Strukturierte Kundenanfrage',
    states:{DRAFT:'Zur Bestätigung bereit',QUEUED:'Wartet auf Übermittlung',SENDING:'Übermittlung läuft',RETRY:'Übermittlung wird erneut versucht',APPLIED:'Anfrage bei KnaBa angenommen',QUARANTINED:'Anfrage muss geprüft werden',BLOCKED:'Übermittlung erfordert Prüfung',CANCELLED:'Übermittlung zurückgenommen',UNKNOWN:'Übermittlungsstatus unklar — Prüfung erforderlich'},
  },
  en: {
    title:'Prepare a request',intro:'Send a structured request to KnaBa. Review and confirm the details before sending.',
    name:'Name',email:'Email',phone:'Phone',contactHint:'Provide an email address or phone number.',service:'Service',choose:'Choose a service',condition:'Condition / requirements',period:'Preferred period',optional:'optional',
    preview:'Review details',review:'Your request before sending',confirm:'Confirm and send request',consent:'I have reviewed these details and want to send this request to KnaBa for processing.',
    edit:'Edit details',cancel:'Withdraw transmission',cancelPending:'The withdrawal needs review. A transmission that has already started cannot reliably be recalled.',refresh:'Refresh status',
    required:'Enter your name, a contact method and a service.',privacy:'Acknowledge the privacy notice above and complete the security check if shown.',failure:'The action could not be confirmed. Refresh the status before trying again.',changed:'The details or approval have changed. Load the current status and review the request again.',expired:'This preview has expired. Edit the details and review them again.',newConversation:'Start a new conversation for another request. Acceptance does not mean an operator has connected.',ownerTitle:'Structured customer request',
    states:{DRAFT:'Ready for confirmation',QUEUED:'Waiting to send',SENDING:'Sending',RETRY:'Retrying transmission',APPLIED:'Request accepted by KnaBa',QUARANTINED:'Request needs review',BLOCKED:'Transmission needs review',CANCELLED:'Transmission withdrawn',UNKNOWN:'Transmission status unknown — review needed'},
  },
  uk: {
    title:'Підготувати заявку',intro:'Надішліть структуровану заявку KnaBa. Перед відправленням перевірте та підтвердьте дані.',
    name:'Ім’я',email:'Email',phone:'Телефон',contactHint:'Укажіть email або номер телефону.',service:'Послуга',choose:'Оберіть послугу',condition:'Стан / потреби',period:'Бажаний період',optional:'необов’язково',
    preview:'Перевірити дані',review:'Ваша заявка перед відправленням',confirm:'Підтвердити й надіслати заявку',consent:'Я перевірив дані та хочу передати цю заявку KnaBa для опрацювання.',
    edit:'Змінити дані',cancel:'Відкликати передавання',cancelPending:'Відкликання потребує перевірки. Уже розпочате передавання не можна гарантовано скасувати.',refresh:'Оновити статус',
    required:'Укажіть ім’я, спосіб зв’язку та послугу.',privacy:'Підтвердьте політику конфіденційності вище та пройдіть перевірку безпеки, якщо вона показана.',failure:'Не вдалося підтвердити результат дії. Оновіть статус перед повторною спробою.',changed:'Дані або дозвіл змінилися. Завантажте поточний статус і перевірте заявку ще раз.',expired:'Строк цієї попередньої перевірки минув. Змініть дані та перевірте їх знову.',newConversation:'Для іншої заявки почніть нову розмову. Приймання заявки ще не означає підключення оператора.',ownerTitle:'Структурована заявка клієнта',
    states:{DRAFT:'Готово до підтвердження',QUEUED:'Очікує передавання',SENDING:'Передавання триває',RETRY:'Повторна спроба передавання',APPLIED:'Заявку прийнято KnaBa',QUARANTINED:'Заявка потребує перевірки',BLOCKED:'Передавання потребує перевірки',CANCELLED:'Передавання відкликано',UNKNOWN:'Результат передавання невідомий — потрібна перевірка'},
  },
  ru: {
    title:'Подготовить заявку',intro:'Отправьте структурированную заявку KnaBa. Перед отправкой проверьте и подтвердите данные.',
    name:'Имя',email:'Email',phone:'Телефон',contactHint:'Укажите email или номер телефона.',service:'Услуга',choose:'Выберите услугу',condition:'Состояние / потребности',period:'Желаемый период',optional:'необязательно',
    preview:'Проверить данные',review:'Ваша заявка перед отправкой',confirm:'Подтвердить и отправить заявку',consent:'Я проверил данные и хочу передать эту заявку KnaBa для обработки.',
    edit:'Изменить данные',cancel:'Отозвать передачу',cancelPending:'Отзыв требует проверки. Уже начавшуюся передачу нельзя гарантированно отменить.',refresh:'Обновить статус',
    required:'Укажите имя, способ связи и услугу.',privacy:'Подтвердите политику конфиденциальности выше и пройдите проверку безопасности, если она показана.',failure:'Не удалось подтвердить результат действия. Обновите статус перед повторной попыткой.',changed:'Данные или разрешение изменились. Загрузите текущий статус и проверьте заявку снова.',expired:'Срок этой предварительной проверки истёк. Измените данные и проверьте их снова.',newConversation:'Для другой заявки начните новую беседу. Принятие заявки ещё не означает подключение оператора.',ownerTitle:'Структурированная заявка клиента',
    states:{DRAFT:'Готово к подтверждению',QUEUED:'Ожидает передачи',SENDING:'Передача выполняется',RETRY:'Повторная попытка передачи',APPLIED:'Заявка принята KnaBa',QUARANTINED:'Заявка требует проверки',BLOCKED:'Передача требует проверки',CANCELLED:'Передача отозвана',UNKNOWN:'Результат передачи неизвестен — нужна проверка'},
  },
};
