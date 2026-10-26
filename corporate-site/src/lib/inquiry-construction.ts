import { offerBySlug } from '../data/construction-offers';
import { inquiryLimits, validateInquiry, type InquiryData } from './inquiry';
import type { PublicLocale } from './public-i18n';

/** Keep the existing CRM category while carrying the client's precise request. */
export function constructionTopicPrefix(topic: string, locale: PublicLocale): string {
  if (!topic) return '';
  const offer = offerBySlug(topic);
  if (!offer) throw new Error('Unknown construction topic');
  const label = { de: 'Bauleistung', en: 'Construction service', uk: 'Будівельна послуга', ru: 'Строительная услуга' }[locale];
  return `${label}: ${offer.name[locale]}\n`;
}

export function constructionMessageLimit(topic: string, locale: PublicLocale): number {
  return inquiryLimits.message - constructionTopicPrefix(topic, locale).length;
}

export function constructionInquiryData(data: InquiryData, topic: string, locale: PublicLocale): InquiryData {
  const prefix = constructionTopicPrefix(topic, locale);
  return { ...data, service: prefix ? 'baureinigung' : data.service, message: prefix + data.message };
}

export function validateConstructionInquiry(data: InquiryData, topic: string, locale: PublicLocale) {
  const errors = validateInquiry(constructionInquiryData(data, topic, locale), locale);
  const limit = constructionMessageLimit(topic, locale);
  if (data.message.length > limit) errors.message = {
    de: `Bitte kürzen Sie Ihre Nachricht auf maximal ${limit} Zeichen für diese Leistung.`,
    en: `Please shorten your message to ${limit} characters for this service.`,
    uk: `Скоротіть повідомлення до ${limit} символів для цієї послуги.`,
    ru: `Сократите сообщение до ${limit} символов для этой услуги.`,
  }[locale];
  return errors;
}
