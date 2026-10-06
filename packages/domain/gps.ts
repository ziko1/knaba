import {assert, type Actor, type Data, type Entity} from './core.ts';

/** Permanent event metadata deliberately cannot contain coordinates, even nested ones. */
export function gpsMetadata(data:Data):Data {
 const keys=['eventId','deviceId','shiftId','tripId','sequenceNumber','observedAt','policyVersionId','employeeId','siteIds','receivedAt','mode','expiresAt','quality','source','isEvidenceOfPerson'];
 return Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
}
export function gpsAcknowledgement(value:Entity|Data):Data {
 const data=value.data??value;
 return {eventId:data.eventId,sampleId:value.data?value.id:(value as Data).sampleId,accepted:true,expiresAt:data.expiresAt};
}
export function gpsCoordinates(data:Data) {
 const {latitude,longitude,accuracyM}=data;
 assert(Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180&&Number.isFinite(accuracyM)&&accuracyM>0&&accuracyM<=100000,'VALIDATION_ERROR');
 assert(typeof data.employeeId==='string'&&data.employeeId.length>0&&Number.isFinite(Date.parse(data.expiresAt))&&Array.isArray(data.siteIds)&&data.siteIds.every((id:unknown)=>typeof id==='string'&&id.length>0),'VALIDATION_ERROR');
 return {latitude,longitude,accuracyM};
}
export function gpsSampleVisible(actor:Actor,sample:Entity,scoped:Actor,now=Date.now()):boolean {
 const d=sample.data;
 if(actor.roles.some(r=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST'].includes(r))||sample.companyId!==actor.companyId||!Number.isFinite(Date.parse(d.expiresAt))||Date.parse(d.expiresAt)<=now||!Number.isFinite(d.latitude)||!Number.isFinite(d.longitude))return false;
 if(d.employeeId===actor.userId)return true;
 return scoped.permissions.includes('location.history.read')&&(scoped.permissions.includes('scope.company')||Array.isArray(d.siteIds)&&d.siteIds.length>0&&d.siteIds.every((id:string)=>scoped.siteIds.includes(id)));
}
