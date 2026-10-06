import {assert} from '../../packages/domain/core.ts';
import type {AssistantToolHost} from '../../packages/integrations/assistant-tools.ts';
import type {DatabaseLike,EngineLike,SqlTransaction} from './auth.ts';
/** Both HTTP confirmation and provider tools use the same fresh scoped domain host. */
export function assistantToolHost(db:DatabaseLike,engine:EngineLike,now?:()=>Date,guard?:(tx:SqlTransaction)=>Promise<void>):AssistantToolHost<SqlTransaction>{
 assert(engine.actorIn&&engine.visible&&engine.scope&&engine.context,'MISSING_CONFIGURATION',{reason:'SCOPED_ASSISTANT_RUNTIME_REQUIRED'});
 const actorIn=engine.actorIn.bind(engine),visible=engine.visible.bind(engine),scope=engine.scope.bind(engine),context=engine.context.bind(engine);
 return {transaction:(c,a,fn,timeout)=>db.transaction(c,a,async tx=>{await guard?.(tx);const result=await fn(tx);await guard?.(tx);return result;},timeout),actorIn,visible,registry:engine.registry,context:(tx,a,key,v,time,p)=>context(tx,scope(a,p),key,v,time,[],p),now};
}
