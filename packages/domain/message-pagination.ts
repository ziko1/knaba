import {assert,type CommandContext,type Entity} from './core.ts';

export interface MessageReadInput {channel_id:string;query?:string;limit:number;after?:string;after_id?:string;}
const compare=(a:Pick<Entity,'createdAt'|'id'>,b:Pick<Entity,'createdAt'|'id'>)=>a.createdAt<b.createdAt?-1:a.createdAt>b.createdAt?1:Buffer.compare(Buffer.from(a.id,'utf8'),Buffer.from(b.id,'utf8'));
type MessageSql={query:(sql:string,parameters:unknown[])=>Promise<{rows:any[]}>};

/** Called only after the current channel membership/scope guard; SQL fetch is bounded before projection. */
export async function readChannelMessages(ctx:CommandContext,input:MessageReadInput,historyFrom:string):Promise<Entity[]>{
 assert(Number.isInteger(input.limit)&&input.limit>=1&&input.limit<=100,'VALIDATION_ERROR');
 const sql=(ctx.tx as unknown as Partial<MessageSql>).query;
 const forward=input.after_id!==undefined;
 if(sql){
  const order=forward?'ASC':'DESC';
  const result=await sql.call(ctx.tx,`SELECT company_id,kind,id,version,data,created_at,updated_at FROM aggregates
   WHERE company_id=$1 AND kind='message' AND data->>'channel_id'=$2
   AND COALESCE(data->>'deleted_at','') IN ('','false') AND created_at >= $3::timestamptz
   AND ($4::timestamptz IS NULL OR CASE WHEN $5::text IS NULL THEN created_at > $4::timestamptz
      ELSE (date_trunc('milliseconds',created_at AT TIME ZONE 'UTC'),id COLLATE "C") > ($4::timestamptz AT TIME ZONE 'UTC',$5::text COLLATE "C") END)
   AND ($6::text IS NULL OR position(lower($6::text) in lower(data->>'text')) > 0)
   ORDER BY date_trunc('milliseconds',created_at AT TIME ZONE 'UTC') ${order},id COLLATE "C" ${order} LIMIT $7`,
   [ctx.actor.companyId,input.channel_id,historyFrom,input.after??null,input.after_id??null,input.query??null,input.limit]);
  const rows:Entity[]=result.rows.map(row=>({companyId:row.company_id,kind:row.kind,id:row.id,version:row.version,data:row.data,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()}));
  assert(rows.length<=input.limit&&rows.every(row=>row.companyId===ctx.actor.companyId&&row.kind==='message'&&row.data.channel_id===input.channel_id&&!row.data.deleted_at),'NOT_FOUND_SAFE');
  return rows.sort(compare);
 }
 // Explicit CPU/test transaction fallback. Live PgTransaction always supplies query.
 const matching=(await ctx.tx.list('message')).filter(message=>message.companyId===ctx.actor.companyId&&message.data.channel_id===input.channel_id&&!message.data.deleted_at&&message.createdAt>=historyFrom&&(!input.after||message.createdAt>input.after||forward&&compare(message,{createdAt:input.after,id:input.after_id!})>0)&&(!input.query||message.data.text.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()))).sort(compare);
 return forward?matching.slice(0,input.limit):matching.slice(-input.limit);
}
