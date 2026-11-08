import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(`${process.env.RUNNER_TEMP}/erp-vitest.json`,'utf8'));
if(report.success!==true || report.numTotalTests<1 || report.numPassedTests!==report.numTotalTests || report.numFailedTests!==0 || report.numPendingTests!==0 || report.numTodoTests!==0) {
  throw new Error('ALL_DISCOVERED_ERP_TESTS_MUST_PASS_WITHOUT_SKIPS');
}
const requiredFederationPostgres={
  'site-federation-ledger.integration.test.ts':12,
  'site-identity-link.integration.test.ts':12,
  'site-federation-login.integration.test.ts':18,
};
for(const [file,count] of Object.entries(requiredFederationPostgres)) {
  const suites=report.testResults?.filter(suite=>suite.name.endsWith('/tests/'+file));
  if(suites?.length!==1 || suites[0].assertionResults?.length!==count || suites[0].assertionResults.some(test=>test.status!=='passed')) {
    throw new Error('REQUIRED_FEDERATION_POSTGRESQL_INVENTORY_MISSING: '+file);
  }
}
console.log('Passed ERP assertions:',report.numPassedTests);
