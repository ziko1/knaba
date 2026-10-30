import {offerBySlug} from '../data/construction-offers';
import type {PublicLocale} from './public-i18n';

/** Legal documents retain their real DE/RU routes; portal UI keeps the selected language. */
export function inquirySupportPath(path: '/datenschutz/' | '/konto/', locale: PublicLocale): string {
  if(path==='/konto/')return locale==='ru'?'/ru/konto/':path+'?lang='+locale;
  return locale === 'ru' ? '/ru' + path : path;
}

/** Carry only recognized service choices, never arbitrary query text or personal data. */
export function inquirySelectionQuery(search: string): string {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  const topic = input.get('anliegen');
  if (topic && offerBySlug(topic)) output.set('anliegen', topic);
  if (input.get('leistung') === 'baureinigung') output.set('leistung', 'baureinigung');
  const query = output.toString();
  return query ? '?' + query : '';
}
