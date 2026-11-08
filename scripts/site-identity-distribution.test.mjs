import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderSiteIdentityPage,siteIdentityClient} from '../corporate-site/vps/site-identity-ui.mjs';
test('ERP standalone and VPS identity protocol/UI distribution bytes stay identical',async()=>{
 for(const file of ['site-identity-protocol.mjs','site-identity-protocol.d.mts','site-identity-ui.mjs','site-identity-ui.d.mts']){
  const [canonical,copy]=await Promise.all([readFile(new URL('../corporate-site/vps/'+file,import.meta.url)),readFile(new URL('../erp/packages/integrations/'+file,import.meta.url))]);
  assert.deepEqual(copy,canonical,file+' distribution drift; run node scripts/sync-site-identity.mjs');
 }
});
test('neutral landing page has external same-origin script and no transfer secret in markup',()=>{
 for(const mode of ['erp','site']){const html=renderSiteIdentityPage(mode);assert.match(html,/name="referrer" content="no-referrer"/);assert.match(html,/autocomplete="current-password"/);assert.match(html,/<script src="\//);assert.doesNotMatch(html,/grantToken|challengeToken|csrfToken/);}
 // This checks packaging and JavaScript syntax only, not rendered browser acceptance.
 assert.doesNotThrow(()=>new Function(siteIdentityClient));
});
