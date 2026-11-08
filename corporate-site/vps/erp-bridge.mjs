import {pathToFileURL} from 'node:url';
import {openLocalDatabase,LocalD1} from './database.mjs';

/** Compatibility CLI: one queue and one Worker-owned state machine, no SQL sender here. */
export class BridgeError extends Error {
  constructor(code){super(code);this.code=code;this.name='BridgeError';}
}
const fail=code=>{throw new BridgeError(code);};
const safePath=value=>typeof value==='string'&&value.startsWith('/')&&value.length<=2000&&!/[\u0000-\u001f\u007f]/.test(value);
const runtime=()=>import('../dist/vps/erp-intake.mjs');

/** Async shared validation; must run before the CLI opens any database. */
export async function parseBridgeConfig(env={},nowMs=Date.now()){
  if(env.KNABA_ERP_BRIDGE_ENABLED!=='true'||env.KNABA_ERP_TRANSFER_APPROVED!=='true')fail('BRIDGE_DISABLED');
  if(!Number.isSafeInteger(nowMs)||nowMs<0)fail('BRIDGE_CONFIGURATION_INVALID');
  const {readErpLeadConfig}=await runtime();
  const config=await readErpLeadConfig(env,nowMs);
  if(!config)fail('BRIDGE_CONFIGURATION_INVALID');
  return config;
}

/** At most one already-pinned event. Legacy rows are held, never silently backfilled. */
export async function deliverPendingLead(db,env={},transport=fetch,nowMs){
  const clock=nowMs===undefined?Date.now:()=>nowMs;
  await parseBridgeConfig(env,clock());
  const {drainErpLeads,deliverErpLead}=await runtime();
  const bridgeEnv=Object.create(env);Object.defineProperty(bridgeEnv,'DB',{value:new LocalD1(db)});
  const summary=await drainErpLeads(bridgeEnv,{limit:1,now:clock,
    transport:(config,delivery,options)=>deliverErpLead(config,delivery,{...options,fetch:transport})});
  const outcome=summary.outcomes?.[0];
  return {status:outcome?.status??(summary.claimed?'STALE':'IDLE'),...(outcome?.reason?{reason:outcome.reason}:{})};
}

async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--once')fail('BRIDGE_DISABLED');
  const dbPath=process.env.KNABA_DB_PATH;if(!safePath(dbPath))fail('BRIDGE_CONFIGURATION_INVALID');
  // Never open a live database or apply migrations through a delivery command.
  await parseBridgeConfig(process.env);
  const {db}=openLocalDatabase(dbPath,{allowMigrations:false});
  try{const result=await deliverPendingLead(db,process.env);console.log('KNABA_ERP_BRIDGE',result.status);}
  finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error('KNABA_ERP_BRIDGE',error instanceof BridgeError?error.code:'DEPENDENCY_UNAVAILABLE');process.exitCode=1;});
}
