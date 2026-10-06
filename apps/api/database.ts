import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DomainError, Entity, Transaction, Data } from '../../packages/domain/core.ts';
import {gpsCoordinates,gpsMetadata} from '../../packages/domain/gps.ts';
const migrationPath=new URL('../../infra/001_init.sql',import.meta.url);
export async function assertGpsStorageSafe(runner:{query:(sql:string,params?:any[])=>Promise<any>},companyId?:string){await runner.query('SELECT knaba_assert_gps_storage_safe($1::text)',[companyId??null]);}
export class PgTransaction implements Transaction {
 constructor(private client:PoolClient,public companyId:string,public actorId:string){}
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const r=await this.client.query(kind==='location_sample'?`SELECT a.*,p.latitude,p.longitude,p.accuracy_m FROM aggregates a LEFT JOIN gps_points p ON p.company_id=a.company_id AND p.id=a.id AND p.expires_at>clock_timestamp() WHERE a.company_id=$1 AND a.kind=$2 AND a.id=$3`:'SELECT * FROM aggregates WHERE company_id=$1 AND kind=$2 AND id=$3',[this.companyId,kind,id]);if(!r.rows[0])throw new DomainError('NOT_FOUND_SAFE');return this.map(r.rows[0]);}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{const r=await this.client.query(kind==='location_sample'?`SELECT a.*,p.latitude,p.longitude,p.accuracy_m FROM aggregates a LEFT JOIN gps_points p ON p.company_id=a.company_id AND p.id=a.id AND p.expires_at>clock_timestamp() WHERE a.company_id=$1 AND a.kind=$2 ORDER BY a.created_at,a.id`:'SELECT * FROM aggregates WHERE company_id=$1 AND kind=$2 ORDER BY created_at,id',[this.companyId,kind]);return r.rows.map(x=>this.map<T>(x));}
 private map<T extends Data>(r:any):Entity<T>{const data=r.kind==='location_sample'?{...gpsMetadata(r.data),...(r.latitude!==null&&r.latitude!==undefined?{latitude:r.latitude,longitude:r.longitude,accuracyM:r.accuracy_m}:{})}:r.data;return {id:r.id,companyId:r.company_id,kind:r.kind,version:r.version,data:data as T,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()};}
 async add<T extends Data=Data>(kind:string,data:T,id:string=randomUUID()):Promise<Entity<T>>{const coordinates=kind==='location_sample'?gpsCoordinates(data):undefined;const stored=coordinates?gpsMetadata(data):data;try{const r=await this.client.query('INSERT INTO aggregates(company_id,kind,id,data) VALUES($1,$2,$3,$4) RETURNING *',[this.companyId,kind,id,JSON.stringify(stored)]);const entity=this.map<T>(r.rows[0]);await this.revision(entity);if(coordinates)await this.client.query('INSERT INTO gps_points(company_id,id,employee_id,site_ids,latitude,longitude,accuracy_m,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[this.companyId,id,data.employeeId,data.siteIds,coordinates.latitude,coordinates.longitude,coordinates.accuracyM,data.expiresAt]);return coordinates?{...entity,data:{...entity.data,...coordinates} as T}:entity;}catch(e:any){if(e.code==='23505')throw new DomainError('VERSION_CONFLICT');throw e;}}
 async save<T extends Data=Data>(entity:Entity,data:T,expectedVersion=entity.version):Promise<Entity<T>>{if(entity.companyId!==this.companyId)throw new DomainError('ACCESS_DENIED');if(entity.kind==='location_sample')throw new DomainError('INVALID_STATE',{reason:'GPS_EVENT_METADATA_IMMUTABLE'});const r=await this.client.query('UPDATE aggregates SET data=$1,version=version+1,updated_at=now() WHERE company_id=$2 AND kind=$3 AND id=$4 AND version=$5 RETURNING *',[JSON.stringify(data),this.companyId,entity.kind,entity.id,expectedVersion]);if(!r.rows[0])throw new DomainError('VERSION_CONFLICT');const result=this.map<T>(r.rows[0]);await this.revision(result);return result;}
 private async revision(entity:Entity){await this.client.query('INSERT INTO aggregate_revisions(company_id,kind,id,version,data,actor_id) VALUES($1,$2,$3,$4,$5,$6)',[this.companyId,entity.kind,entity.id,entity.version,JSON.stringify(entity.data),this.actorId]);await this.client.query('INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail) VALUES($1,$2,$3,$4,$5,$6)',[this.companyId,this.actorId,entity.version===1?'CREATE':'UPDATE',entity.kind,entity.id,JSON.stringify({version:entity.version})]);}
 async event(type:string,data:Data){await this.client.query('INSERT INTO outbox(id,company_id,type,data) VALUES($1,$2,$3,$4)',[randomUUID(),this.companyId,type,JSON.stringify(data)]);}
 async query(sql:string,params:unknown[]=[]){return this.client.query(sql,params);}
}
export class Database{
 pool:Pool;
 constructor(url=process.env.DATABASE_URL){if(!url)throw new Error('MISSING_DATABASE_URL');this.pool=new Pool({connectionString:url,max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});this.pool.on('error',()=>process.stderr.write('database connection failure\n'));}
 async query(sql:string,params:unknown[]=[]){return this.pool.query(sql,params);}
 async transaction<T>(companyId:string,actorId:string,fn:(tx:PgTransaction)=>Promise<T>,timeoutMs?:number):Promise<T>{
  if(timeoutMs!==undefined&&(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000))throw new DomainError('VALIDATION_ERROR');
  const deadline=timeoutMs===undefined?undefined:Date.now()+timeoutMs;
  for(let attempt=0;attempt<3;attempt++){
   if(deadline!==undefined&&Date.now()>=deadline)throw new DomainError('TRANSACTION_TIMEOUT');
   const c=await this.pool.connect();let sessionLocked=false;let destroy=false;
   try{
    // Acquire the company lock before creating a SERIALIZABLE snapshot. A transaction
    // that waited must observe holds/permission changes committed while it waited.
    if(deadline!==undefined){const remaining=deadline-Date.now();if(remaining<=0)throw new DomainError('TRANSACTION_TIMEOUT');await c.query("SELECT set_config('statement_timeout',$1,false),set_config('lock_timeout',$1,false)",[String(remaining)+'ms']);}
    await c.query('SELECT pg_advisory_lock(hashtext($1))',[companyId]);sessionLocked=true;
    if(deadline!==undefined&&Date.now()>=deadline)throw new DomainError('TRANSACTION_TIMEOUT');
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    if(deadline!==undefined){const remaining=deadline-Date.now();if(remaining<=0)throw new DomainError('TRANSACTION_TIMEOUT');await c.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)",[String(remaining)+'ms']);}
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[companyId]);
    await c.query('SELECT pg_advisory_unlock(hashtext($1))',[companyId]);sessionLocked=false;
    const result=await fn(new PgTransaction(c,companyId,actorId));
    if(deadline!==undefined&&Date.now()>=deadline)throw new DomainError('TRANSACTION_TIMEOUT');
    await c.query('COMMIT');return result;
   }catch(e:any){try{await c.query('ROLLBACK');}catch{destroy=true;}if((e.code==='40001'||e.code==='40P01')&&attempt<2)continue;throw e;
   }finally{try{if(sessionLocked)await c.query('SELECT pg_advisory_unlock(hashtext($1))',[companyId]);await c.query("RESET statement_timeout");await c.query("RESET lock_timeout");}catch{destroy=true;}c.release(destroy);}
  }
  throw new Error('TRANSACTION_RETRIES_EXHAUSTED');
 }
 async migrate(sql?:string){const source=sql??(globalThis as any).__KNABA_MIGRATION__??await readFile(migrationPath,'utf8');const c=await this.pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(710324003)');await c.query(source);await assertGpsStorageSafe(c);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async close(){await this.pool.end();}
}
let singleton:Database|undefined;
export function getDatabase(){return singleton??=new Database();}
export const db=new Proxy({} as Database,{get(_target,key){const value=(getDatabase() as any)[key];return typeof value==='function'?value.bind(getDatabase()):value;}});
