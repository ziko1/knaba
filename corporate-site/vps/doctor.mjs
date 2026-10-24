import { inspectStorage } from './storage.mjs';
const path=process.argv.slice(2).find(x=>!x.startsWith('--'))||'/var/lib/knaba';
const strict=process.argv.includes('--strict');
try{
  const report={filesystem:path,...inspectStorage(path)};
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(report.state==='critical'||(strict&&!report.cutoverAllowed))process.exitCode=2;
}catch(e){
  process.stderr.write('Storage inspection failed: '+String(e.message||'unknown')+'\n');
  process.exitCode=2;
}
