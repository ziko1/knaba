import {fetchInboxLabels,type InboxLabels,type InboxLocale} from './assistant-inbox-i18n';

export const assistantInquiryAction={de:'Anfrage erstellen / ansehen',en:'Create / view request',pl:'Utwórz / zobacz zapytanie',lt:'Sukurti / peržiūrėti užklausą',uk:'Створити / переглянути заявку',ru:'Создать / просмотреть заявку'} as const;
export type AssistantRequestLabels=Pick<InboxLabels,Extract<keyof InboxLabels,`request${string}`|`transfer_${string}`>>;
const required='requestHeading requestTransferConsent requestFields requestLocalOnly requestLanguage requestServiceGroup requestUnavailable requestClosed requestLoading requestLoadError requestRefresh requestMore requestCount requestSource requestSiteStatus requestERPStatus requestCancel requestCancelConfirm requestCancelBoundary requestChanged requestNeedConsent requestError request_new request_reviewing request_scheduled request_in_progress request_completed request_cancelled transfer_PENDING transfer_LEASED transfer_APPLIED transfer_REVIEW transfer_BLOCKED transfer_UNKNOWN transfer_NOT_QUEUED'.split(' ');

/** Public text uses the existing separate locale assets, never an inline dictionary. */
export async function fetchAssistantRequestLabels(locale:InboxLocale):Promise<AssistantRequestLabels>{
  const value=await fetchInboxLabels(locale);
  if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>{
    const text=(value as Record<string,unknown>)[key];
    return typeof text!=='string'||!text.trim()||text.length>4000||/[<>]/.test(text);
  }))throw Error('Invalid request language pack');
  return value as AssistantRequestLabels;
}
