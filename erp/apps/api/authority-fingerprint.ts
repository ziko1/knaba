import { createHash } from 'node:crypto';
import { assert, DomainError, type Actor, type Data, type Entity } from '../../packages/domain/core.js';
import type { EngineLike, SqlTransaction } from './auth.js';

const LIMIT = 2500;
const fail = ():never => {throw new DomainError('ACCESS_DENIED', { reason: 'AUTHORITY_SNAPSHOT_INVALID' });};
function bounded<T>(items:T[]):T[] { if(items.length>LIMIT)fail();return items; }
function text(value:unknown):string|null { if(value===undefined||value===null)return null;if(typeof value!=='string'||value.length>200)fail();return value as string; }
function strings(value:unknown):string[] { if(!Array.isArray(value))fail();return [...new Set(bounded(value as unknown[]).map(v=>text(v)??fail()))].sort(); }
function date(value:unknown):string|null { if(value===undefined||value===null||value==='')return null;const valueText=text(value),ms=Date.parse(valueText!);return Number.isFinite(ms)?new Date(ms).toISOString():'INVALID'; }
function current(d:Data,now:number,strictActive=false):boolean {
  if(strictActive?d.active!==true:d.active===false)return false;
  if(d.revoked_at||d.revokedAt||d.left_at||d.leftAt||d.removed_at||d.removedAt)return false;
  const expiry=d.expiresAt??d.expires_at,start=d.startsAt??d.starts_at;
  return (!expiry||(Number.isFinite(Date.parse(expiry))&&Date.parse(expiry)>now))&&(!start||(Number.isFinite(Date.parse(start))&&Date.parse(start)<=now));
}
function sorted<T>(items:T[]):T[] { return bounded(items).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))); }
const policyReferences=['legalApprovalReference','necessityApprovalReference','worksCouncilReference','employeeNoticeReference'] as const;

/** Hash-only, read-only current authority snapshot for stream revocation checks.
 * Content, entity versions, profile fields and other members never enter the hash.
 * The returned actor must retain Engine's permission-specific delegation context.
 */
export async function authorityFingerprint(tx:SqlTransaction,engine:EngineLike,actor:Actor,nowISO:string):Promise<string> {
  const now=Date.parse(nowISO);assert(Number.isFinite(now)&&engine.actorIn&&engine.scope,'ACCESS_DENIED',{reason:'AUTHORITY_SNAPSHOT_UNAVAILABLE'});
  const fresh=await engine.actorIn(tx,actor.userId);
  assert(fresh.userId===actor.userId&&fresh.companyId===actor.companyId,'ACCESS_DENIED');
  const permissions=strings(fresh.permissions);
  const scopes=permissions.map(permission=>{
    const scoped=engine.scope!(fresh,permission);
    assert(scoped.userId===fresh.userId&&scoped.companyId===fresh.companyId&&scoped.permissions.includes(permission),'ACCESS_DENIED');
    return {permission,company:scoped.permissions.includes('scope.company'),siteIds:strings(scoped.siteIds),customerIds:strings(scoped.customerIds),warehouseIds:strings(scoped.warehouseIds)};
  });
  const memberships=sorted((await tx.list('customer_membership')).filter(m=>m.companyId===fresh.companyId&&(m.data.userId??m.data.user_id)===fresh.userId&&current(m.data,now,true)).map(m=>({
    id:text(m.id),customerId:text(m.data.customerId),siteIds:strings(m.data.siteIds??[]),permissions:strings(m.data.permissions??[]),startsAt:date(m.data.startsAt??m.data.starts_at),expiresAt:date(m.data.expiresAt??m.data.expires_at)
  })));
  const ownChannels=bounded((await tx.list('channel')).filter(c=>c.companyId===fresh.companyId&&Array.isArray(c.data.members)&&c.data.members.some((m:Data)=>m.user_id===fresh.userId&&current(m,now))));
  const channels=[];
  for(const channel of ownChannels){
    const d=channel.data;
    const members=sorted(bounded<Data>((d.members as Data[]).filter(m=>m.user_id===fresh.userId&&current(m,now))).map(m=>({
      historyFrom:date(m.history_from??m.historyFrom),expiresAt:date(m.expires_at??m.expiresAt),startsAt:date(m.starts_at??m.startsAt),external:m.external===true,permissions:strings(m.permissions??[]),source:text(m.source),claimOwnerId:text(m.claim_owner_id??m.claimOwnerId)
    })));
    channels.push({id:text(channel.id),type:text(d.type),siteId:text(d.site_id??d.siteId),taskId:text(d.task_id??d.taskId),customerId:text(d.customer_id??d.customerId),confidential:d.confidential===true,visibility:text(d.visibility),historyPolicy:text(d.history_policy??d.historyPolicy),visible:engine.visible?await engine.visible(tx,fresh,channel):null,members});
  }
  const gps:unknown[]=[];
  if(permissions.some(p=>p.startsWith('location.')||p.startsWith('gps.'))){
    const policies=bounded((await tx.list('tracking_policy')).filter(p=>p.companyId===fresh.companyId&&(p.data.approvedAt||['APPROVED','SUPERSEDED','DISABLED'].includes(p.data.state))));
    const legal=new Map<string,Entity|undefined>();
    for(const policy of policies){
      const d=policy.data,approvals=[];
      for(const field of policyReferences){
        const id=text(d[field]);if(!id)continue;
        if(!legal.has(id)){try{const row=await tx.get('legal_approval',id);legal.set(id,row.companyId===fresh.companyId?row:undefined);}catch(error:any){if(!['NOT_FOUND_SAFE','NOT_FOUND'].includes(error.code))throw error;legal.set(id,undefined);}}
        const a=legal.get(id)?.data;
        approvals.push({field,id,present:!!a,subject:text(a?.subject),status:text(a?.status),active:a?.active!==false,effective:!!a&&a.status==='APPROVED'&&a.active!==false&&(!a.expiresAt||(Number.isFinite(Date.parse(a.expiresAt))&&Date.parse(a.expiresAt)>now)),expiresAt:date(a?.expiresAt)});
      }
      const approvedAt=date(d.approvedAt),expiresAt=date(d.expiresAt),closedAt=date(d.disabledAt??d.supersededAt);
      gps.push({id:text(policy.id),state:text(d.state),enabled:d.enabled===true,active:d.active!==false,accessRoles:strings(d.accessRoles??[]),allowPresence:d.allowPresence===true,allowBusinessRoute:d.allowBusinessRoute===true,allowMinimalReturn:d.allowMinimalReturn===true,approvedAt,expiresAt,closedAt,effective:d.state==='APPROVED'&&d.enabled===true&&d.active!==false&&!!approvedAt&&approvedAt!=='INVALID'&&Date.parse(approvedAt)<=now&&!!expiresAt&&expiresAt!=='INVALID'&&Date.parse(expiresAt)>now&&(!closedAt||(closedAt!=='INVALID'&&Date.parse(closedAt)>now)),approvals:sorted(approvals)});
    }
  }
  const snapshot={version:1,userId:fresh.userId,companyId:fresh.companyId,roles:strings(fresh.roles),permissions,scopes,memberships,channels:sorted(channels),gps:sorted(gps)};
  const bytes=JSON.stringify(snapshot);assert(Buffer.byteLength(bytes,'utf8')<=2_000_000,'ACCESS_DENIED',{reason:'AUTHORITY_SNAPSHOT_TOO_LARGE'});
  return createHash('sha256').update(bytes,'utf8').digest('hex');
}
