import {assert,type Entity} from './core.ts';

export interface CrewEmployeeOffer {
 employeeId:string; scheduleVersion:number; status:'PROPOSED'|'ACCEPTED'|'DECLINED'|'EXPIRED';
 expiresAt:string|null; respondedAt?:string; respondedBy?:string; reason?:string;
}

export function newCrewOffers(employeeIds:string[],scheduleVersion:number,expiresAt:string):CrewEmployeeOffer[]{
 return employeeIds.map(employeeId=>({employeeId,scheduleVersion,status:'PROPOSED',expiresAt}));
}

/** Pure projection: expired pending offers cannot be accepted even before the
 * explicit expiry command persists them. Legacy acknowledgments remain valid. */
export function crewOffers(assignment:Entity,now:string):CrewEmployeeOffer[]{
 const d=assignment.data;
 const source:CrewEmployeeOffer[]=d.employeeOffers??newCrewOffers(d.employeeIds,d.scheduleVersion,d.startAt).map(offer=>({...offer,expiresAt:d.startAt??null,status:(d.acknowledgedIds??[]).includes(offer.employeeId)?'ACCEPTED':'PROPOSED'}));
 assert(Array.isArray(source)&&source.length===d.employeeIds.length&&new Set(source.map(o=>o.employeeId)).size===source.length,'INVALID_STATE',{reason:'CREW_OFFERS_INVALID'});
 return source.map(offer=>{
  assert(d.employeeIds.includes(offer.employeeId)&&offer.scheduleVersion===d.scheduleVersion&&['PROPOSED','ACCEPTED','DECLINED','EXPIRED'].includes(offer.status)&&(Number.isFinite(Date.parse(offer.expiresAt??''))||offer.status==='ACCEPTED'&&offer.expiresAt===null),'INVALID_STATE',{reason:'CREW_OFFERS_INVALID'});
  return {...offer,status:offer.status==='PROPOSED'&&Date.parse(offer.expiresAt??'')<=Date.parse(now)?'EXPIRED':offer.status};
 });
}

/** Keep legacy self-response array fields, restricted to the responder. The
 * command receipt must not disclose coworker offer reasons or private costs. */
export function personalCrewResponse(assignment:Entity,employeeId:string,now:string):Entity{
 const offer=crewOffers(assignment,now).find(row=>row.employeeId===employeeId);assert(offer,'NOT_FOUND_SAFE');
 const data:Record<string,any>={employeeId,employeeIds:[employeeId],acknowledgedIds:(assignment.data.acknowledgedIds??[]).includes(employeeId)?[employeeId]:[],employeeOffers:[offer],offer};
 for(const key of ['orderId','siteId','status','startAt','endAt','scheduleVersion','requireEmployeeAck'])if(assignment.data[key]!==undefined)data[key]=assignment.data[key];
 return {...assignment,data};
}

