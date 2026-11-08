import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(process.argv[2],'utf8');
const exec=new Function('report',source.replace(/import \{readFileSync\} from 'node:fs';\n/,'').replace(/const report=JSON.parse\(readFileSync\([^\n]+\n/,'').replace(/console\.log\([^\n]+\n/,''));
const files={'site-federation-ledger.integration.test.ts':12,'site-identity-link.integration.test.ts':12,'site-federation-login.integration.test.ts':18};
const good=()=>({success:true,numTotalTests:42,numPassedTests:42,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:Object.entries(files).map(([name,n])=>({name:'/candidate/erp/tests/'+name,assertionResults:Array.from({length:n},()=>({status:'passed'}))}))});
let checks=0;exec(good());checks++;
for(const name of Object.keys(files)){
 for(const kind of ['missing','duplicate','short','failed']){
  const x=good(),i=x.testResults.findIndex(v=>v.name.endsWith(name));
  if(kind==='missing')x.testResults.splice(i,1);
  if(kind==='duplicate')x.testResults.push(x.testResults[i]);
  if(kind==='short')x.testResults[i].assertionResults.pop();
  if(kind==='failed')x.testResults[i].assertionResults[0].status='failed';
  assert.throws(()=>exec(x),/REQUIRED_FEDERATION_POSTGRESQL_INVENTORY_MISSING/);checks++;
 }
}
for(const patch of [{numPendingTests:1},{numTodoTests:1},{numFailedTests:1},{numPassedTests:0},{numTotalTests:0},{success:false}]){assert.throws(()=>exec({...good(),...patch}),/ALL_DISCOVERED_ERP_TESTS/);checks++;}
console.log(JSON.stringify({status:'PASS',checks,scope:'Executed exact existing workflow ERP rejection block with explicit synthetic reports; not PostgreSQL test execution'}));
