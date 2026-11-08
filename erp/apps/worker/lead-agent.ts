import type {Database,PgTransaction} from '../api/database.ts';
import type {Engine} from '../api/engine.ts';
import type {OutboxJob} from './runner.ts';
import {assert,DomainError,type Entity} from '../../packages/domain/core.ts';
import {ZodError} from 'zod';
import {leadAgentAccess,queueLeadSearch,storeLeadSearch} from '../../packages/domain/lead-agent.ts';
import {profileSchema} from '../../packages/domain/lead-agent-model.ts';
import {searchLeadSource,type LeadFetch,type SourceBatch} from '../../packages/integrations/lead-agent-sources.ts';

async function lease(tx:PgTransaction,job:OutboxJob){
  const result=await tx.query("SELECT id FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token??null]);
  assert(result.rows.length===1,'WORKER_LEASE_LOST');
}
async function authority(tx:PgTransaction,engine:Engine,run:Entity){
  const profile=await tx.get('lead_agent_profile',run.data.profileId);
  assert(!profile.data.archived&&profile.version===run.data.profileVersion,'PROFILE_CHANGED');
  assert(profile.companyId===run.companyId&&profile.data.ownerUserId===run.data.ownerUserId,'ACCESS_DENIED');
  const actor=engine.scope(await engine.actorIn(tx,run.data.ownerUserId),'lead_agent.manage');
  assert(leadAgentAccess(actor,profile),'ACCESS_DENIED');return profile;
}
/** Read operations can be retried, but only a current lease and unchanged authority may publish results. */
export async function processLeadSearch(db:Database,engine:Engine,job:OutboxJob,enabled:boolean,now:()=>Date,request?:LeadFetch){
  try{return await performLeadSearch(db,engine,job,enabled,now,request);}catch(error){
    const terminal=error instanceof ZodError?'VALIDATION_ERROR':error instanceof DomainError&&['LEAD_STORAGE_LIMIT','PROFILE_CHANGED','VALIDATION_ERROR'].includes(error.code)?error.code:null;
    if(!terminal)throw error;
    // The failed batch transaction has rolled back. Publish its terminal state separately under the lease.
    await db.transaction(job.company_id,'knaba-integration-service',async tx=>{
      await lease(tx,job);const run=await tx.get('lead_agent_run',job.data.runId);
      if(['QUEUED','RUNNING'].includes(run.data.status))await tx.save(run,{...run.data,status:'FAILED',reason:terminal,finishedAt:now().toISOString()},run.version);
      await lease(tx,job);
    });
  }
}
async function performLeadSearch(db:Database,engine:Engine,job:OutboxJob,enabled:boolean,now:()=>Date,request?:LeadFetch){
  const prepared=await db.transaction(job.company_id,'knaba-integration-service',async tx=>{
    await lease(tx,job);
    const run=await tx.get('lead_agent_run',job.data.runId);
    assert(run.data.profileId===job.data.profileId&&run.data.profileVersion===job.data.profileVersion&&run.data.ownerUserId===job.data.ownerUserId,'ACCESS_DENIED');
    if(!['QUEUED','RUNNING'].includes(run.data.status))return null;
    if(!enabled){await tx.save(run,{...run.data,status:'BLOCKED',reason:'PUBLIC_SEARCH_DISABLED',finishedAt:now().toISOString()},run.version);return null;}
    try{
      const profile=await authority(tx,engine,run);
      if(now().getTime()-Date.parse(run.data.requestedAt)>900000){await tx.save(run,{...run.data,status:'CANCELLED',reason:'RUN_EXPIRED',finishedAt:now().toISOString()},run.version);return null;}
      await tx.save(run,{...run.data,status:'RUNNING',startedAt:run.data.startedAt??now().toISOString()},run.version);
      return {profile:profileSchema.parse(profile.data.profile)};
    }catch(error){if(!(error instanceof DomainError)||!['PROFILE_CHANGED','ACCESS_DENIED','NOT_FOUND_SAFE','USER_INACTIVE'].includes(error.code))throw error;await tx.save(run,{...run.data,status:'CANCELLED',reason:'AUTHORITY_OR_PROFILE_CHANGED',finishedAt:now().toISOString()},run.version);return null;}
  });
  if(!prepared)return;
  const batches:SourceBatch[]=[];
  for(const source of prepared.profile.sources){
    const current=await db.transaction(job.company_id,'knaba-integration-service',async tx=>{
      await lease(tx,job);const run=await tx.get('lead_agent_run',job.data.runId);if(run.data.status!=='RUNNING')return false;
      try{await authority(tx,engine,run);return true;}catch(error){if(!(error instanceof DomainError))throw error;await tx.save(run,{...run.data,status:'CANCELLED',reason:'AUTHORITY_OR_PROFILE_CHANGED',finishedAt:now().toISOString()},run.version);return false;}
    });
    if(!current)return;
    batches.push(await searchLeadSource(source,prepared.profile,now().toISOString(),request));
  }
  await db.transaction(job.company_id,'knaba-integration-service',async tx=>{
    await lease(tx,job);const run=await tx.get('lead_agent_run',job.data.runId);if(run.data.status!=='RUNNING')return;
    let profile:Entity;
    try{profile=await authority(tx,engine,run);}catch(error){if(!(error instanceof DomainError))throw error;await tx.save(run,{...run.data,status:'CANCELLED',reason:'AUTHORITY_OR_PROFILE_CHANGED',finishedAt:now().toISOString()},run.version);return;}
    await storeLeadSearch(tx,profile,run,batches,now().toISOString());
    // Holding the row lock can delay renewal. Expiration during a large batch must roll back every result.
    await lease(tx,job);
  });
}

export async function scheduleLeadSearch(tx:PgTransaction,engine:Engine,now:string,enabled=true){
  const abandoned=await tx.query(`SELECT r.id,o.status AS job_status FROM aggregates r
    LEFT JOIN LATERAL (SELECT status FROM outbox WHERE company_id=$1 AND type='lead_agent.search_requested' AND data->>'runId'=r.id ORDER BY created_at DESC LIMIT 1) o ON true
    WHERE r.company_id=$1 AND r.kind='lead_agent_run' AND r.data->>'status' IN ('QUEUED','RUNNING')
      AND (o.status IN ('FAILED','CANCELLED') OR r.created_at<$2::timestamptz-interval '15 minutes') ORDER BY r.created_at LIMIT 100`,[tx.companyId,now]);
  for(const row of abandoned.rows){const run=await tx.get('lead_agent_run',row.id),terminal=['FAILED','CANCELLED'].includes(row.job_status);await tx.save(run,{...run.data,status:terminal?'FAILED':'CANCELLED',reason:terminal?'WORKER_FAILED':'RUN_EXPIRED',finishedAt:now},run.version);}
  if(!enabled)return;
  const due=await tx.query(`SELECT p.id FROM aggregates p
    WHERE p.company_id=$1 AND p.kind='lead_agent_profile' AND p.data->>'archived'='false' AND p.data->'profile'->>'scheduleEnabled'='true'
      AND NOT EXISTS (SELECT 1 FROM aggregates r WHERE r.company_id=$1 AND r.kind='lead_agent_run' AND r.data->>'profileId'=p.id
        AND r.created_at > $2::timestamptz - make_interval(mins=>CASE WHEN p.data->'profile'->>'intervalMinutes' ~ '^[0-9]{1,5}$' THEN (p.data->'profile'->>'intervalMinutes')::int ELSE 10080 END))
    ORDER BY p.created_at,p.id LIMIT 20`,[tx.companyId,now]);
  for(const candidate of due.rows){
    const profile=await tx.get('lead_agent_profile',candidate.id);
    const pause=async(reason:string)=>tx.save(profile,{...profile.data,profile:{...profile.data.profile,scheduleEnabled:false},schedulePauseReason:reason,schedulePausedAt:now},profile.version);
    const config=profileSchema.safeParse(profile.data.profile);if(!config.success){await pause('INVALID_PROFILE');continue;}
    let allowed=false;
    try{const actor=engine.scope(await engine.actorIn(tx,profile.data.ownerUserId),'lead_agent.manage');allowed=leadAgentAccess(actor,profile);}catch(error){if(!(error instanceof DomainError))throw error;}
    // A revoked owner must not permanently occupy the bounded oldest-profile window.
    if(!allowed){await pause('AUTHORITY_REVOKED');continue;}
    await queueLeadSearch(tx,profile,now,profile.data.ownerUserId,'SCHEDULED');
  }
}
