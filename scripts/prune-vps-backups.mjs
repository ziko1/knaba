import {readdir,lstat,realpath,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const directory=process.env.BACKUP_DIR;
if(directory!=='/backups'||await realpath(directory)!=='/backups')throw Error('VPS_BACKUP_DIRECTORY_REQUIRED');
const cutoff=Date.now()-14*24*60*60*1000;
const candidates=[];
for(const name of await readdir(directory)){
 const match=/^knaba-de-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.tar\.enc$/.exec(name);
 if(!match)continue;
 const created=Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
 if(!Number.isFinite(created))continue;
 const archive=await lstat(`${directory}/${name}`),sidecar=await lstat(`${directory}/${name}.hmac`).catch(()=>null);
 if(!archive.isFile()||!sidecar?.isFile())continue;
 const valid=spawnSync(process.execPath,[fileURLToPath(new URL('./backup-mac.mjs',import.meta.url)),'verify',`${directory}/${name}`],{env:process.env,stdio:'ignore',timeout:60000});
 if(valid.status!==0)continue; // Only verified pairs count toward the seven retained backups.
 candidates.push({name,created,modified:Math.max(archive.mtimeMs,sidecar.mtimeMs)});
}
candidates.sort((a,b)=>b.created-a.created);
let removed=0;
for(const entry of candidates.slice(7)){
 if(entry.created>=cutoff||entry.modified>=cutoff)continue;
 const path=`${directory}/${entry.name}`;
 const verified=spawnSync(process.execPath,[fileURLToPath(new URL('./backup-mac.mjs',import.meta.url)),'verify',path],{env:process.env,stdio:'ignore',timeout:60000});
 if(verified.status!==0)continue; // Preserve damaged/untrusted pairs for investigation.
 await unlink(path);await unlink(path+'.hmac');removed++;
}
console.log(`PASSED: backup retention inspected; removed ${removed} authenticated pairs older than 14 days; newest seven retained.`);
