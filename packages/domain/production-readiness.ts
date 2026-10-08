import {assert,type Transaction} from './core.ts';

export const PRODUCTION_RETENTION_CATEGORIES=['PROFILE','TIME','PAYROLL','GPS','CHAT','MEDIA','AUDIT'] as const;

/** Company-approved records are prerequisites, never supplied by a deployment flag. */
export async function assertProductionRetentionMatrix(tx:Transaction&{companyId?:string},now=new Date().toISOString()){
 assert(typeof tx.companyId==='string'&&tx.companyId.length>0,'MISSING_CONFIGURATION');
 const at=Date.parse(now),policies=await tx.list('retention_policy');
 assert(Number.isFinite(at),'VALIDATION_ERROR');
 const approved:string[]=[];
 for(const category of PRODUCTION_RETENTION_CATEGORIES){
  let valid=false;
  for(const policy of policies.filter(row=>row.companyId===tx.companyId&&row.data.category===category&&row.data.state==='APPROVED')){
   const d=policy.data;
   if(!d.createdBy||!d.approvedBy||d.createdBy===d.approvedBy||!Number.isFinite(Date.parse(d.approvedAt))||Date.parse(d.approvedAt)>at||!Number.isInteger(d.retentionDays)||d.retentionDays<0||d.retentionDays>36500||typeof d.previewHash!=='string'||!/^[a-f0-9]{64}$/.test(d.previewHash))continue;
   try{
    const legal=await tx.get('legal_approval',d.legalApprovalId),a=legal.data,bounds=a.scope?.retentionProfiles?.[category];
    if(legal.companyId!==tx.companyId||legal.version!==d.legalApprovalVersion||a.subject!=='PRIVACY'||a.status!=='APPROVED'||a.active!==true||a.testOnly===true||a.synthetic===true||typeof a.evidenceReference!=='string'||a.evidenceReference.length<8||!Number.isFinite(Date.parse(a.approvedAt))||Date.parse(a.approvedAt)>at||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=at)continue;
    if(!bounds||!Number.isInteger(bounds.minDays)||!Number.isInteger(bounds.maxDays)||bounds.minDays<0||bounds.maxDays>36500||bounds.minDays>bounds.maxDays||d.minDays!==bounds.minDays||d.maxDays!==bounds.maxDays||d.retentionDays<bounds.minDays||d.retentionDays>bounds.maxDays)continue;
    valid=true;break;
   }catch{continue;}
  }
  assert(valid,'NEEDS_APPROVAL',{reason:'PRODUCTION_RETENTION_MATRIX_INCOMPLETE',category});approved.push(category);
 }
 return {categories:approved,status:'APPROVED_CURRENT_MATRIX' as const};
}
