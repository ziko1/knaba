import type {Database,PgTransaction} from './database.ts';
import type {Engine} from './engine.ts';
import type {CommandRegistry} from '../../packages/domain/core.ts';
import type {PrivateBlobStore} from '../../packages/storage/index.ts';
import {applyClientRedaction,clientRedactionInput,type ClientRedactionHost} from '../../packages/storage/client-redaction.ts';

/** The Engine supplies receipt-first replay and its current company transaction. */
export function createClientRedactionCommands(_db:Database,engine:Engine,store:PrivateBlobStore):CommandRegistry {
 const host:ClientRedactionHost<PgTransaction>={store,actorIn:(tx,userId)=>engine.actorIn(tx,userId),scope:(actor,permission)=>engine.scope(actor,permission),visible:(tx,actor,entity)=>engine.visible(tx,actor,entity)};
 return {'media.redact':{permission:'report.approve',schema:clientRedactionInput,handler:(ctx,input)=>applyClientRedaction(ctx,input,host)}};
}
