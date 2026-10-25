import type {InquiryData} from './inquiry.ts';
import {inquiryLimits} from './inquiry.ts';
import {constructionOffers,offerBySlug} from '../data/construction-offers.ts';
import type {ConstructionOffer} from '../data/construction-offers.ts';

export type ConstructionOfferSlug=ConstructionOffer['slug'];
export const defaultConstructionOffer:ConstructionOfferSlug='baureinigung';

/** Reject untrusted query/URL values without changing legacy CRM service enums. */
export function resolveOfferFromQuery(value:unknown):ConstructionOfferSlug {
  if(typeof value!=='string')return defaultConstructionOffer;
  return offerBySlug(value)?.slug ?? defaultConstructionOffer;
}
function checkedOffer(slug:string):ConstructionOffer {
  const offer=offerBySlug(slug);
  if(!offer)throw new Error('Bitte wählen Sie eine gültige Bauleistung.');
  return offer;
}

/** Stable, human-readable offer identity inside existing backend's 500-char message. */
function prefix(slug:string):string {
  const offer=checkedOffer(slug);
  return 'Bauleistung ['+offer.slug+']: '+offer.name.de;
}
export function constructionNoteLimit(slug:string):number {
  return inquiryLimits.message-prefix(slug).length-1;
}

/** Pure transform: originals untouched; no new DB columns, user-supplied enum or URL PII. */
export function prepareConstructionLead(data:InquiryData,slug:string):InquiryData {
  return {...data,service:'baureinigung',message:constructionMessage(slug,data.message)};
}
export const constructionOfferSlugs: readonly ConstructionOfferSlug[]=constructionOffers.map(offer=>offer.slug);

/** The only additional-work metadata stored is this verified text in the existing request message. */
export function constructionMessage(slug:string,notes:string):string {
  const header=prefix(slug);
  const clean=notes.trim();
  const value=header+(clean?'\n'+clean:'');
  if(value.length>inquiryLimits.message)throw new RangeError('Die Nachricht darf maximal 500 Zeichen enthalten.');
  return value;
}

/** Derived display-only category; never an authorization, billing or execution decision. */
export function offerFromConstructionMessage(input:unknown):ConstructionOffer|null {
  if(typeof input!=='string')return null;
  for(const offer of constructionOffers){
    const header=prefix(offer.slug);
    if(input===header||input.startsWith(header+'\n'))return offer;
  }
  return null;
}
