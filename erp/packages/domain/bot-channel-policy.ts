import {z} from 'zod';
import {assert,DomainError,type Actor,type CommandRegistry,type Transaction} from './core.ts';

/**
 * Company-owned channel preferences. Persist ONLY non-secret values.
 * This is not a provider credential store and never turns on external sending.
 */
const channel=z.enum(['WHATSAPP','TELEGRAM']);
const language=z.enum(['DE','EN','RU','UK']);
const settings=z.object({
  channel,defaultLanguage:language,
  workerRequestsEnabled:z.boolean(),
  partnerRequestsEnabled:z.boolean(),
  humanEscalationEnabled:z.literal(true),
  replyMode:z.enum(['HUMAN_FIRST','RULE_BASED'])
}).strict();
export type BotChannelPolicy=z.infer<typeof settings>;
export type BotChannel=BotChannelPolicy['channel'];

const defaults=(provider:BotChannel):BotChannelPolicy=>({
  channel:provider,defaultLanguage:'DE',workerRequestsEnabled:true,
  partnerRequestsEnabled:true,humanEscalationEnabled:true,replyMode:'HUMAN_FIRST'
});
/** Human-first never sends an unsolicited public reply; explicit consent/provider
 * gating in the existing durable outbox remains mandatory in rule-based mode. */
export function botAllowsPublicAutoReply(preferences:BotChannelPolicy):boolean {
  return preferences.replyMode==='RULE_BASED';
}
const configId=(provider:BotChannel)=>'knaba-channel-'+provider.toLowerCase();
function manager(actor:Actor,companyId:string,write=false){
  assert(actor.companyId===companyId&&actor.permissions.includes('bot.settings.manage')&&
    actor.roles.some(role=>['OWNER','DIRECTOR','DEVELOPER_SUPPORT'].includes(role)),
    'ACCESS_DENIED');
  if(write)assert(actor.mfaVerified===true,'NEEDS_REAUTH');
}
async function record(tx:Transaction,provider:BotChannel){
  const records=(await tx.list('bot_config')).filter(row=>row.id===configId(provider));
  assert(records.length<=1,'INVALID_STATE');
  return records[0];
}
export async function botChannelPolicyFor(tx:Transaction,provider:BotChannel):Promise<BotChannelPolicy>{
  const row=await record(tx,provider);
  if(!row)return defaults(provider);
  const boundCompany=(tx as Transaction&{companyId?:string}).companyId;
  if(boundCompany!==undefined)assert(row.companyId===boundCompany,'ACCESS_DENIED');
  // Ignore metadata, never trust a stored role or provider-ready flag.
  const parsed=settings.safeParse({
    channel:row.data.channel,defaultLanguage:row.data.defaultLanguage,
    workerRequestsEnabled:row.data.workerRequestsEnabled,
    partnerRequestsEnabled:row.data.partnerRequestsEnabled,
    humanEscalationEnabled:row.data.humanEscalationEnabled,replyMode:row.data.replyMode
  });
  assert(parsed.success&&parsed.data.channel===provider,'INVALID_STATE');
  return parsed.data;
}
export const botChannelPolicyCommands:CommandRegistry={
  'bot.channel.preferences.read':{
    permission:'bot.settings.manage',
    schema:z.object({channel}).strict(),
    handler:async(c,input)=>{
      manager(c.actor,(c.tx as Transaction&{companyId?:string}).companyId??c.actor.companyId);
      const row=await record(c.tx,input.channel);
      return {...await botChannelPolicyFor(c.tx,input.channel),version:row?.version??0,
        providerReady:false,credentials:'SERVER_SECRET_NOT_RETURNED'};
    }
  },
  'bot.channel.preferences.configure':{
    permission:'bot.settings.manage',highRisk:true,schema:settings,
    handler:async(c,input)=>{
      manager(c.actor,(c.tx as Transaction&{companyId?:string}).companyId??c.actor.companyId,true);
      const existing=await record(c.tx,input.channel);
      if(existing){
        assert(c.expectedVersion===existing.version,'VERSION_CONFLICT');
      }else assert(c.expectedVersion===undefined,'VERSION_CONFLICT');
      // No token, chat ID, webhook secret, private profile or free-form string enters the record.
      const data={...input,updatedBy:c.actor.userId,updatedAt:c.now,
        technicalStatus:'PROVIDER_SETUP_REQUIRED'};
      const saved=existing?await c.tx.save(existing,data,existing.version):
        await c.tx.add('bot_config',data,configId(input.channel));
      await c.tx.event('bot.channel_preferences_updated',{
        channel:input.channel,config_id:saved.id,version:saved.version,updated_by:c.actor.userId
      });
      return {...input,version:saved.version,providerReady:false,
        credentials:'SERVER_SECRET_NOT_RETURNED'};
    }
  }
};
