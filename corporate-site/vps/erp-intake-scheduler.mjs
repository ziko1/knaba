/** Only these server-owned bindings may enter the public site's ERP dispatcher. */
export const erpIntakeKeys=Object.freeze([
  'KNABA_ERP_BRIDGE_ENABLED','KNABA_ERP_TRANSFER_APPROVED','KNABA_ERP_URL','KNABA_ERP_ALLOWED_ORIGIN','KNABA_ERP_COMPANY_ID',
  'KNABA_ERP_KEY_ID','KNABA_ERP_SECRET','KNABA_ERP_MAPPING_VERSION','KNABA_ERP_SERVICE_MAP_JSON','KNABA_ERP_APPROVED_PRIVACY_VERSION',
  'KNABA_ERP_KEY_NOT_BEFORE','KNABA_ERP_KEY_NOT_AFTER'
]);

/** Read settings afresh at every security fence; never copy them to a response. */
export function bindErpIntakeEnvironment(target,environment){
  for(const key of erpIntakeKeys)Object.defineProperty(target,key,{enumerable:true,get:()=>environment[key]});
  return target;
}

/** Bounded batches belong to the Worker. This host only prevents overlapping ticks. */
export function createErpIntakeScheduler({worker,env,onError=()=>{}}){
  let stopped=false,running=null;
  const runNow=()=>{
    // Local expiry/source-erasure maintenance also runs while delivery is off.
    // The core dispatcher owns the independent, default-disabled network gate.
    if(stopped||typeof worker.scheduled!=='function')return Promise.resolve();
    if(running)return running;
    running=(async()=>{
      const tasks=[];
      // This scheduler is exclusively for ERP intake, never an email activation.
      const scoped=Object.create(env);
      Object.defineProperty(scoped,'ASSISTANT_NOTIFICATIONS_ENABLED',{value:'0'});
      const returned=worker.scheduled({scheduledTime:Date.now(),cron:'vps-erp-intake'},scoped,{waitUntil:promise=>tasks.push(Promise.resolve(promise))});
      if(returned&&typeof returned.then==='function')tasks.push(returned);
      const results=await Promise.allSettled(tasks);
      if(results.some(result=>result.status==='rejected'))throw Error('ERP_INTAKE_TICK_FAILED');
    })().catch(()=>{try{onError();}catch{/* A reporting hook cannot stop future ticks. */}}).finally(()=>{running=null;});
    return running;
  };
  const timer=setInterval(()=>{void runNow();},30000);timer.unref();
  void runNow();
  return {runNow,async stop(){stopped=true;clearInterval(timer);await running;}};
}
