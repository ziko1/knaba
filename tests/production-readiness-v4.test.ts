import {describe,it,expect} from 'vitest';
import {assertProductionRetentionMatrix,PRODUCTION_RETENTION_CATEGORIES} from '../packages/domain/production-readiness.ts';
import {DomainError,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';
const NOW='2026-10-08T20:00:00.000Z';
function fixture(){
 const legal:Entity={id:'legal',kind:'legal_approval',companyId:'company',version:1,createdAt:NOW,updatedAt:NOW,data:{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'Recorded external review reference fixture only',approvedAt:'2026-10-01T00:00:00.000Z',expiresAt:'2026-11-01T00:00:00.000Z',scope:{retentionProfiles:Object.fromEntries(PRODUCTION_RETENTION_CATEGORIES.map(c=>[c,{minDays:1,maxDays:400}]))}}};
 const policies:Entity[]=PRODUCTION_RETENTION_CATEGORIES.map(category=>({id:category,kind:'retention_policy',companyId:'company',version:2,createdAt:NOW,updatedAt:NOW,data:{category,state:'APPROVED',createdBy:'author',approvedBy:'different-owner',approvedAt:NOW,retentionDays:30,minDays:1,maxDays:400,legalApprovalId:legal.id,legalApprovalVersion:1,previewHash:'a'.repeat(64)}}));
 const tx={companyId:'company',list:async()=>policies,get:async(kind:string,id:string)=>{if(kind!=='legal_approval'||id!==legal.id)throw new DomainError('NOT_FOUND_SAFE');return legal;}} as unknown as Transaction;
 return {tx,legal,policies};
}
describe('V4 production startup current approved retention matrix (explicit transaction double)',()=>{
 it('requires all seven recorded categories with current legal bounds and independent approval',async()=>{const {tx}=fixture();expect(await assertProductionRetentionMatrix(tx,NOW)).toEqual({categories:PRODUCTION_RETENTION_CATEGORIES,status:'APPROVED_CURRENT_MATRIX'});});
 it.each(PRODUCTION_RETENTION_CATEGORIES)('blocks a missing %s category',async category=>{const f=fixture();f.policies.splice(f.policies.findIndex(p=>p.data.category===category),1);await expect(assertProductionRetentionMatrix(f.tx,NOW)).rejects.toMatchObject({code:'NEEDS_APPROVAL',details:{category}});});
 it.each([{active:false},{testOnly:true},{synthetic:true},{status:'DRAFT'},{expiresAt:NOW},{evidenceReference:''},{approvedAt:'2027-01-01T00:00:00.000Z'}] satisfies Data[])('rejects invalid/revoked/synthetic legal authority %#',async patch=>{const f=fixture();Object.assign(f.legal.data,patch);await expect(assertProductionRetentionMatrix(f.tx,NOW)).rejects.toMatchObject({code:'NEEDS_APPROVAL'});});
 it.each([{approvedBy:'author'},{legalApprovalVersion:2},{retentionDays:401},{minDays:0},{previewHash:''},{approvedAt:'2027-01-01T00:00:00.000Z'}] satisfies Data[])('rejects forged/stale or out-of-bounds policy %#',async patch=>{const f=fixture();Object.assign(f.policies[0]!.data,patch);await expect(assertProductionRetentionMatrix(f.tx,NOW)).rejects.toMatchObject({code:'NEEDS_APPROVAL',details:{category:'PROFILE'}});});
 it('never reads another company legal record as company authority',async()=>{const f=fixture();f.legal.companyId='foreign';await expect(assertProductionRetentionMatrix(f.tx,NOW)).rejects.toMatchObject({code:'NEEDS_APPROVAL'});});
});
