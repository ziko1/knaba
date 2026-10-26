import { createReadStream } from 'node:fs';
import { readdir, stat, lstat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, relative } from 'node:path';
const [operation,target]=process.argv.slice(2);if(!target)throw new Error('BACKUP_PATH_REQUIRED');
async function checksum(file){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
async function collect(root,path=root){const entries=[];for(const entry of await readdir(path)){const file=resolve(path,entry),info=await lstat(file);if(info.isSymbolicLink()||!info.isDirectory()&&!info.isFile())throw new Error('BACKUP_SPECIAL_FILE_FORBIDDEN');if(info.isDirectory())entries.push(...await collect(root,file));else entries.push({path:relative(root,file).replaceAll('\\','/'),byteSize:info.size,sha256:await checksum(file)});}return entries;}
if(operation==='create'){let files=[];try {files=await collect(resolve(target,'private-files'));}catch(error){if(error.code!=='ENOENT')throw error;}await writeFile(resolve(target,'file-checksums.json'),JSON.stringify(files,null,2)+'\n',{mode:0o600});}
else if(operation==='verify'){const files=JSON.parse(await readFile(resolve(target,'file-checksums.json'),'utf8'));for(const expected of files){if(expected.path.startsWith('/')||expected.path.split('/').includes('..'))throw new Error('UNSAFE_BACKUP_PATH');const file=resolve(target,'private-files',expected.path);if((await stat(file)).size!==expected.byteSize||await checksum(file)!==expected.sha256)throw new Error('PRIVATE_FILE_CHECKSUM_MISMATCH');}}
else if(operation==='inspect'){
  if((await stat(target)).size>Number(process.env.MAX_RESTORE_ARCHIVE_BYTES||50*1024**3))throw new Error('RESTORE_ARCHIVE_TOO_LARGE');
  // GNU tar lists the header type first; only regular files and directories are accepted.
  const lines=await new Promise((resolve,reject)=>{let output='';const child=spawn('tar',['--quoting-style=escape','-tvf',target],{stdio:['ignore','pipe','ignore']});child.stdout.on('data',bytes=>{output+=bytes;if(output.length>16*1024*1024){child.kill();reject(new Error('RESTORE_ARCHIVE_TOO_MANY_FILES'));}});child.on('error',reject);child.on('close',code=>code===0?resolve(output.split('\n').filter(Boolean)):reject(new Error('INVALID_BACKUP_ARCHIVE')));});
  for(const line of lines){if(!['-','d'].includes(line[0]))throw new Error('BACKUP_LINK_OR_SPECIAL_FILE_FORBIDDEN');const path=line.replace(/^\S+\s+\S+\s+\d+\s+\S+\s+\S+\s+/,'');if(path.startsWith('/')||path.split('/').includes('..')||path.includes('\\'))throw new Error('UNSAFE_BACKUP_ARCHIVE_PATH');if(!['database.dump','manifest.json','file-checksums.json'].includes(path)&&!path.startsWith('private-files/'))throw new Error('UNEXPECTED_BACKUP_ARCHIVE_ENTRY');}
}
else throw new Error('INVALID_BACKUP_FILE_OPERATION');
