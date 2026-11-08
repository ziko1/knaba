import {readFile,writeFile} from 'node:fs/promises';
const check=process.argv.slice(2).join(' ')==='--check';
if(process.argv.length>2&&!check)throw Error('Usage: node scripts/sync-site-identity.mjs [--check]');
// Independent ERP container and VPS artifacts need the same self-contained
// protocol/UI. These are distribution copies, never independently edited forks.
for(const file of ['site-identity-protocol.mjs','site-identity-protocol.d.mts','site-identity-ui.mjs','site-identity-ui.d.mts']){
 const source=await readFile(new URL('../corporate-site/vps/'+file,import.meta.url));
 const target=new URL('../erp/packages/integrations/'+file,import.meta.url);
 if(check){const installed=await readFile(target);if(!source.equals(installed))throw Error('SITE_IDENTITY_DISTRIBUTION_DRIFT: '+file);}
 else await writeFile(target,source);
}
console.log(check?'Site identity distribution copies match canonical source.':'Updated site identity distribution copies.');
