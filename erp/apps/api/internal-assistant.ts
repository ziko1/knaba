import {assert} from '../../packages/domain/core.ts';
import {createInternalAssistantCommands,type InternalAssistantHost} from '../../packages/integrations/internal-assistant.ts';
import type {DatabaseLike,EngineLike,SqlTransaction} from './auth.ts';

/** Engine supplies a fresh permission-specific scope for each canonical handler.
 * Worker callers must provide the actual outbox-lease check; HTTP callers use
 * only human request/preview/confirm commands, never provider-result persistence. */
export function internalAssistantHost(db:DatabaseLike,engine:EngineLike,mode:'DEMO'|'TEST'|'PRODUCTION',now?:()=>Date,assertWorkerLease?:(tx:SqlTransaction)=>Promise<void>):InternalAssistantHost<SqlTransaction>{
 assert(engine.actorIn&&engine.visible&&engine.scope&&engine.context,'MISSING_CONFIGURATION');
 const actorIn=engine.actorIn.bind(engine),visible=engine.visible.bind(engine),scope=engine.scope.bind(engine),context=engine.context.bind(engine);
 return {transaction:(companyId,actorId,fn,timeout)=>db.transaction(companyId,actorId,fn,timeout),actorIn,visible,registry:engine.registry,context:(tx,actor,key,version,time,permission)=>context(tx,scope(actor,permission),key,version,time,[],permission),mode,now,assertWorkerLease};
}
export function internalAssistantCommands(db:DatabaseLike,engine:EngineLike,mode:'DEMO'|'TEST'|'PRODUCTION',now?:()=>Date){return createInternalAssistantCommands(internalAssistantHost(db,engine,mode,now));}
