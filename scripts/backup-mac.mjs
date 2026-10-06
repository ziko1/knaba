import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
const [operation,file]=process.argv.slice(2),passphrase=process.env.BACKUP_PASSPHRASE;
if(!file||!['sign','verify'].includes(operation)||!passphrase||passphrase.length<32)throw new Error('BACKUP_KEY_AND_FILE_REQUIRED');
const key=pbkdf2Sync(passphrase,'KNABA-DE-BACKUP-HMAC-V1',600000,32,'sha256'),mac=createHmac('sha256',key);for await(const bytes of createReadStream(file))mac.update(bytes);const actual=mac.digest();key.fill(0);
if(operation==='sign')await writeFile(`${file}.hmac`,actual.toString('hex')+'\n',{mode:0o600});
else {const expected=Buffer.from((await readFile(`${file}.hmac`,'utf8')).trim(),'hex');if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new Error('BACKUP_AUTHENTICATION_FAILED');}
