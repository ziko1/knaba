import {statusLabel,type Language} from '../../../packages/i18n/index';
import type {CrewEmployeeOffer} from '../../../packages/domain/crew-offers';
import type {Entity} from './api';
import {entityName,type Translate} from './CommandForm';

export function CrewOffersPanel({entity,records,language,t}:{entity:Entity;records:Record<string,Entity[]>;language:Language;t:Translate}){
 const offers:CrewEmployeeOffer[]=entity.data.offer?[entity.data.offer]:entity.data.employeeOffers??[];
 if(!offers.length)return null;
 const locale={DE:'de-DE',UK:'uk-UA',RU:'ru-RU',PL:'pl-PL',LT:'lt-LT',EN:'en-GB'}[language];
 return <section className="report-remaining-scope crew-offers-panel" aria-label={t('crewOffers')}><h3>{t('crewOffers')}</h3><p>{t('crewOfferInfo')}</p><ul>{offers.map(offer=>{
  const employee=records.employee?.find(row=>row.id===offer.employeeId);
  return <li key={offer.employeeId}><strong>{employee?entityName(employee):offer.employeeId}</strong><span>{statusLabel(offer.status,t)}</span><dl><div><dt>{t('offerExpiresAt')}</dt><dd>{offer.expiresAt?`${new Date(offer.expiresAt).toLocaleString(locale,{timeZone:'Europe/Berlin'})} · Europe/Berlin`:t('notApplicable')}</dd></div><div><dt>{t('scheduleVersion')}</dt><dd>{offer.scheduleVersion}</dd></div></dl>{offer.reason&&<p>{offer.reason}</p>}</li>;
 })}</ul></section>;
}
