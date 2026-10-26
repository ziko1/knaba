import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import type {D1Database,D1Result,D1Statement,WorkerEnv} from '../../worker/types';

export class Db implements D1Database{
  sql=new DatabaseSync(':memory:');
  constructor(all=true){this.sql.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&(all||!f.startsWith('0007_'))).sort())this.sql.exec(readFileSync('drizzle/'+file,'utf8'));}
  prepare(query:string):D1Statement{
    const sql=this.sql;let values:unknown[]=[];
    return {bind(...args:unknown[]){values=args;return this;},
      async first<T>(column?:string){const row=sql.prepare(query).get(...values as never[]) as Record<string,unknown>|undefined;return row?(column?row[column]:row) as T:null;},
      async all<T>(){return {success:true,results:sql.prepare(query).all(...values as never[]) as T[]};},
      async run(){return {success:true,meta:{changes:Number(sql.prepare(query).run(...values as never[]).changes)}};}};
  }
  async batch<T>(statements:D1Statement[]):Promise<D1Result<T>[]>{this.sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());this.sql.exec('COMMIT');return results as D1Result<T>[];}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
export const erpTestTime=1792922400000,erpTestConversationId='00000000-0000-4000-8000-000000000001';
const time=erpTestTime,id=erpTestConversationId;
export const erpTestInput={name:' Test Client ',email:'CLIENT@example.test',phone:'',serviceId:'service-cleaning',condition:'Construction dust',desiredPeriod:'Next week'};
export const erpTestServices=[{id:'service-cleaning',label:{de:'Baureinigung',en:'Construction cleaning',uk:'Будівельне прибирання',ru:'Строительная уборка'}}];
export const erpTestEnv=():WorkerEnv=>({ASSISTANT_ERP_ENABLED:'approved',ASSISTANT_ERP_ORIGIN:'https://erp.example.test',ASSISTANT_ERP_SOURCE:'knaba_web',ASSISTANT_ERP_SITE_ID:'dev-site',ASSISTANT_ERP_COMPANY_ID:'knaba-test',ASSISTANT_ERP_KEY_ID:'test-key',ASSISTANT_ERP_SECRET:'synthetic-not-a-real-key-123456789',ASSISTANT_ERP_SERVICES_JSON:JSON.stringify(erpTestServices),ASSISTANT_ERP_MAPPING_VERSION:'mapping-v1'});
export function insertErpTestConversation(db:Db,conversationId=id){db.sql.prepare("INSERT INTO assistant_conversations(id,token_hash,locale,status,privacy_version,created_at,updated_at) VALUES (?,?,'de','human','test',?,?)").run(conversationId,'a'.repeat(64),new Date(time).toISOString(),new Date(time).toISOString());}
