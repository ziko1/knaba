import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,realpath,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';

const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const ownedByProcess=details=>typeof process.geteuid!=='function'||details.uid===process.geteuid();
const directoryError=()=>Error('Backup directory must be private mode 0700, owned by this user and not a symlink.');
function checkDirectory(details){
  if(!details.isDirectory()||(details.mode&0o777)!==0o700||!ownedByProcess(details))throw directoryError();
}
async function privateDirectory(directory){
  if(typeof directory!=='string'||!directory)throw directoryError();
  const target=resolve(directory);
  // Check the nearest existing ancestor before mkdir, so a symlink cannot even
  // redirect creation of a new backup directory. Never chmod an existing path.
  let ancestor=target;
  for(;;){
    try{
      const details=await lstat(ancestor);
      if(!details.isDirectory()||await realpath(ancestor)!==ancestor)throw directoryError();
      break;
    }catch(error){
      if(error.code!=='ENOENT'||dirname(ancestor)===ancestor)throw error;
      ancestor=dirname(ancestor);
    }
  }
  await mkdir(target,{recursive:true,mode:0o700});
  const details=await lstat(target);
  checkDirectory(details);
  if(await realpath(target)!==target)throw directoryError();
  return {path:target,details};
}
function checkBackup(details,original){
  if(!details.isFile()||!sameFile(details,original)||(details.mode&0o777)!==0o600||
      details.nlink!==1||!ownedByProcess(details))
    throw Error('Private backup file changed or failed its permissions check.');
}

/** Private CLI-only snapshot. The operator must also control its ancestor
 * directories: SQLite accepts a pathname, not an already-open destination fd.
 * Keep this out of concurrent server handlers because umask is process-wide. */
export async function createPrivateSqliteBackup({db,directory,prefix}){
  if(!['knaba','pre-migrate'].includes(prefix))throw Error('Invalid private backup prefix.');
  const folder=await privateDirectory(directory);
  const path=join(folder.path,prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(12).toString('hex')+'.sqlite');
  const directoryHandle=await open(folder.path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  let file,original;
  const previousUmask=process.umask(0o077);
  try{
    const openedDirectory=await directoryHandle.stat();
    checkDirectory(openedDirectory);
    if(!sameFile(openedDirectory,folder.details))throw directoryError();
    // Reserve a new inode before SQLite can write any credential or personal
    // data. O_EXCL also refuses an existing file or symlink; no overwrite/retry.
    file=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    original=await file.stat();
    checkBackup(original,original);
    await backup(db,path);
    checkBackup(await lstat(path),original);
    const copy=new DatabaseSync(path,{readOnly:true});
    try{
      const integrity=copy.prepare('PRAGMA integrity_check').all();
      if(integrity.length!==1||integrity[0].integrity_check!=='ok'||
          copy.prepare('PRAGMA foreign_key_check').get())
        throw Error('Backup integrity or foreign-key verification failed; source data unchanged.');
    }finally{copy.close();}
    const hash=createHash('sha256');
    let bytes=0;
    for await(const chunk of file.createReadStream({start:0,autoClose:false})){
      hash.update(chunk);bytes+=chunk.length;
    }
    const saved=await lstat(path),currentDirectory=await lstat(folder.path);
    checkBackup(saved,original);
    checkDirectory(currentDirectory);
    if(!sameFile(currentDirectory,folder.details)||bytes!==saved.size)
      throw Error('Private backup changed during verification; source data unchanged.');
    await file.sync();
    await directoryHandle.sync();
    return {path,sha256:hash.digest('hex'),bytes};
  }catch(error){
    // Delete only our own partial inode. Never unlink a replacement or an
    // existing collision target; any uncertain artifact stays in private state.
    if(original){
      const failed=await lstat(path).catch(()=>null);
      if(failed?.isFile()&&sameFile(failed,original))await unlink(path).catch(()=>{});
    }
    throw error;
  }finally{
    try{await file?.close();}
    finally{try{await directoryHandle.close();}finally{process.umask(previousUmask);}}
  }
}
