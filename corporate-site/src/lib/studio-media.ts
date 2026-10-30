import {readdirSync} from 'node:fs';
import {join} from 'node:path';
/** Lists only already-published file names; no arbitrary path, symlinks or uploads. */
export function listStudioMedia(publicRoot:string):string[]{
  const files:string[]=[];
  for(const folder of ['images','illustrations']){
    let entries:Array<{name:string;isFile():boolean}>;
    try{entries=readdirSync(join(publicRoot,folder),{withFileTypes:true});}catch{continue;}
    for(const entry of entries){
      if(!entry.isFile() || !/^[a-z0-9_-]+\.(?:svg|png|jpg|jpeg|webp|avif)$/.test(entry.name))continue;
      files.push('/'+folder+'/'+entry.name);
      if(files.length>=200)break;
    }
  }
  return files.sort();
}
