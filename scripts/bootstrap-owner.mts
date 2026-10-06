import {readFile,stat} from 'node:fs/promises';
import {z} from 'zod';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {AuthService} from '../apps/api/auth.ts';
import {assert} from '../packages/domain/core.ts';
const path=process.argv[2];assert(path&&process.env.APP_MODE==='PRODUCTION','MISSING_CONFIGURATION');
assert(process.env.COMPANY_ID&&process.env.AUTH_ENCRYPTION_KEY&&process.env.AUTH_ENCRYPTION_KEY.length>=32&&process.env.PUBLIC_ORIGIN?.startsWith('https://'),'MISSING_CONFIGURATION');
const info=await stat(path);assert(info.isFile()&&(info.mode&0o077)===0,'MISSING_CONFIGURATION',{reason:'PRIVATE_BOOTSTRAP_FILE_MODE_0600_REQUIRED'});
const input=z.object({company:z.object({legalName:z.string().min(3),address:z.string().min(8),registration:z.string().min(3),evidenceReference:z.string().min(8)}).strict(),owner:z.object({email:z.string().email(),name:z.string().min(1),password:z.string().min(12),totpSecret:z.string().regex(/^[A-Z2-7]{16,100}$/),evidence:z.string().min(8)}).strict()}).strict().parse(JSON.parse(await readFile(path,'utf8')));
const companyId=process.env.COMPANY_ID,db=new Database(),engine=new Engine(db,'PRODUCTION');
try {await db.migrate();await db.transaction(companyId,'OFFLINE_COMPANY_BOOTSTRAP',async tx=>{assert(!(await tx.list('user')).some(u=>u.data.roles?.includes('OWNER')),'INVALID_STATE',{reason:'BOOTSTRAP_CLOSED'});const existing=(await tx.list('company')).find(c=>c.id===companyId);if(!existing)await tx.add('company',{...input.company,active:true,synthetic:false,operatingMode:'PRODUCTION'},companyId);else assert(existing.data.synthetic!==true&&existing.data.legalName===input.company.legalName,'INVALID_STATE',{reason:'COMPANY_FACTS_REVIEW_REQUIRED'});});const auth=new AuthService(db,engine,{companyId,appMode:'PRODUCTION',encryptionKey:process.env.AUTH_ENCRYPTION_KEY,publicOrigin:process.env.PUBLIC_ORIGIN});const result=await auth.bootstrapOwner(input.owner);console.log(JSON.stringify({status:'CREATED',companyId:result.companyId,userId:result.userId,mfaRequired:true,authorityEvidenceRecorded:true}));}
catch {console.error('FAILED: production bootstrap did not complete; inspect company/owner state without exposing private input.');process.exitCode=1;}finally{await db.close();}
