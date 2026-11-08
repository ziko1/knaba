/** Explicit isolated TEST workspace. No default password, public demo login or production bootstrap. */
import {readFile,stat} from 'node:fs/promises';
import {z} from 'zod';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {hashPassword} from '../apps/api/auth.ts';
import {assert} from '../packages/domain/core.ts';
import {profileSchema} from '../packages/domain/lead-agent-model.ts';
const inputPath=process.argv[2];
assert(inputPath&&process.env.APP_MODE==='TEST'&&process.env.COMPANY_ID==='knaba-lead-agent-test','MISSING_CONFIGURATION');
assert(process.env.LIVE_SEND_ALLOWED!=='true'&&process.env.LIVE_INTEGRATION_SEND_ALLOWED!=='true'&&!process.env.DEEPSEEK_API_KEY,'MISSING_CONFIGURATION');
const companyId=process.env.COMPANY_ID!,db=new Database();
try{
  const info=await stat(inputPath);assert(info.isFile()&&(info.mode&0o077)===0&&info.size<=4096,'MISSING_CONFIGURATION');
  const input=z.object({email:z.string().email().max(200),name:z.string().min(1).max(100),password:z.string().min(24).max(128)}).strict().parse(JSON.parse(await readFile(inputPath,'utf8')));
  await db.migrate();const passwordHash=await hashPassword(input.password);
  await db.transaction(companyId,'EXPLICIT_TEST_BOOTSTRAP',async tx=>{
    assert(!(await tx.list('company')).length&&!(await tx.list('user')).length,'INVALID_STATE',{reason:'TEST_BOOTSTRAP_ALREADY_COMPLETED'});
    await tx.add('company',{name:'KNABA Lead Agent · TEST',legalName:'KNABA Lead Agent — synthetic test workspace',address:'Synthetic test workspace, Berlin',operatingMode:'TEST',synthetic:true,timezone:'Europe/Berlin',currency:'EUR'},companyId);
    await tx.add('user',{name:input.name,email:input.email.toLowerCase(),roles:['OWNER'],permissions:['lead.create','lead.manage','commerce.read'],siteIds:[],warehouseIds:[],customerIds:[],active:true,synthetic:true,language:'UK'},'lead-agent-test-operator');
    await tx.query('INSERT INTO auth_credentials(user_id,company_id,password_hash,totp_secret,totp_last_counter) VALUES($1,$2,$3,NULL,-1)',['lead-agent-test-operator',companyId,passwordHash]);
    for(const [id,name]of [['painting','Malerarbeiten'],['cleaning','Reinigung'],['drywall','Trockenbau']])await tx.add('service',{name,description:'Synthetic service for CRM handoff testing; not an approved price book.',active:true,unit:'PERSON_HOUR',model:'HOURLY',included:[],excluded:[],questions:[],requiredSkills:[],requiresVisit:true,synthetic:true},'test-'+id);
  });
  const engine=new Engine(db,'TEST'),actor=await engine.getActor('lead-agent-test-operator',companyId);
  const profile=await engine.execute(actor,'lead_agent.profile.save',{input:{profile:profileSchema.parse({name:'Берлін — перший пошук',sources:['berlin_vergabe','ted'],categories:[],scheduleEnabled:false})},idempotency_key:'lead-agent-test-profile-initial-v1'});
  console.log(JSON.stringify({status:'CREATED',mode:'TEST',companyId,profileId:profile.id,publicDemoLogin:false,externalSend:false,aiProvider:false}));
}catch{console.error('TEST_BOOTSTRAP_FAILED: inspect state without exposing credentials; no automatic reset is permitted.');process.exitCode=1;}
finally{await db.close();}
