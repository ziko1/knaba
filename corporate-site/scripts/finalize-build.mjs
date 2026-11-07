import {lstat,realpath,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Remove Astro server intermediates after the final publicDir copy finishes. */
export async function finalizeBuild(siteRoot=fileURLToPath(new URL('../',import.meta.url))){
  const root=await realpath(siteRoot);
  const outputs=[join(root,'.astro-static'),join(root,'dist','client')];
  // Check all destinations before removing anything. Never follow output links
  // into another workspace or turn a missing build into an apparent success.
  for(const output of outputs){
    const info=await lstat(output);
    if(!info.isDirectory()||await realpath(output)!==output)throw Error('Expected a real build output directory: '+output);
  }
  for(const output of outputs){
    const intermediate=join(output,'.prerender');
    await rm(intermediate,{recursive:true,force:true});
    const remaining=await lstat(intermediate).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(remaining)throw Error('Astro intermediate remains in build output: '+intermediate);
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await finalizeBuild();
