import { statfsSync } from 'node:fs';

/** Read-only filesystem budget, independent of Docker reclaimable estimates. */
const GiB=1024**3;
export function evaluateStorage({available,total},{warningFree=10*GiB,criticalFree=5*GiB,warningUsedPct=90,criticalUsedPct=98}={}){
  if(!Number.isFinite(available)||!Number.isFinite(total)||total<=0||available<0||available>total)
    throw Error('Storage metrics are not reliable.');
  const usedPct=100*(total-available)/total;
  const state=(available<criticalFree || usedPct>=criticalUsedPct)?'critical':
    (available<warningFree || usedPct>=warningUsedPct)?'warning':'healthy';
  return {state,availableBytes:Math.floor(available),totalBytes:Math.floor(total),
    usedPercent:Number(usedPct.toFixed(2)),cutoverAllowed:state==='healthy'};
}
export function inspectStorage(path='/var/lib/knaba'){
  const stats=statfsSync(path);
  return evaluateStorage({available:stats.bavail*stats.bsize,total:stats.blocks*stats.bsize});
}
