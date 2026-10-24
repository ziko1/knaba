import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
const args=process.argv.slice(2);
const argument=(name,fallback)=>{const index=args.indexOf(name);return index>=0?args[index+1]:fallback;};
if(!existsSync('dist/server/wrangler.json')) { console.error('Run npm run build before starting the local portal.');process.exit(1); }
const migrated=await new Promise(resolve=>{const migration=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state'],{stdio:'inherit',env:process.env});migration.on('exit',resolve);});
if(migrated!==0) process.exit(Number(migrated)||1);
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip',argument('--host','127.0.0.1'),'--port',argument('--port','4173'),'--inspector-port','0'],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{process.exitCode=code??1;});
