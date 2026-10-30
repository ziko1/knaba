/** Isolated, synthetic workspaces for the explicitly granted developer only.
 * No production row is copied; browser-selected IDs never select a database.
 */
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {chmodSync,lstatSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {openLocalDatabase} from './database.mjs';
import {hasOwnerAuthority} from './admin-access.mjs';

export const developerRoles=Object.freeze(['owner','admin','client','partner','worker','bauleiter','pending','suspended']);
const cookieName='__Host-knaba-workspace';
const normalized=value=>String(value||'').trim().toLowerCase();
export const isDeveloperIdentity=(user,developerEmail)=>Boolean(user&&developerEmail&&normalized(user.email)===normalized(developerEmail));
export const isGrantedDeveloper=(db,user,ownerEmail,developerEmail)=>isDeveloperIdentity(user,developerEmail)&&
  hasOwnerAuthority(db,{userId:user.id,ownerEmail,developerEmail});
const signature=(role,user)=>createHmac('sha256',user.token).update('knaba-test-role-v1|'+user.id+'|'+role).digest('base64url');

export function developerRoleCookie(role,user,{secure=true}={}){
  if(!developerRoles.includes(role)||!user?.token)throw Error('Invalid test role');
  return cookieName+'='+role+'.'+signature(role,user)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200'+(secure?'; Secure':'');
}
export const clearDeveloperRoleCookie=({secure=true}={})=>cookieName+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(secure?'; Secure':'');
export function readDeveloperRole(cookieHeader,user){
  const values=String(cookieHeader||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(cookieName+'='));
  if(!values.length)return 'owner';
  if(values.length!==1||String(cookieHeader).length>4096)throw Error('Invalid workspace session');
  const value=values[0].slice(cookieName.length+1);
  const parts=value.split('.');
  if(parts.length!==2||!developerRoles.includes(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))throw Error('Invalid workspace session');
  const expected=Buffer.from(signature(parts[0],user));
  const supplied=Buffer.from(parts[1]);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw Error('Invalid workspace session');
  return parts[0];
}

function seed(db,namespace){
  const people=Object.fromEntries(developerRoles.map(role=>[role,{
    id:'test-'+namespace+'-'+role,email:role+'@workspace.example.invalid',name:'TEST · '+role
  }]));
  const now=new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try{
    const insert=db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING');
    for(const [role,user] of Object.entries(people)){
      const approved=['owner','admin','client','partner','worker','bauleiter'].includes(role);
      insert.run(user.id,user.name,user.email,['worker','partner','bauleiter'].includes(role)?role:'client',approved?(role==='owner'?'admin':role):null,
        role==='pending'?'pending':role==='suspended'?'suspended':'approved','test-workspace-v1',now,now,'test-workspace-seed');
    }
    // These are conspicuously synthetic examples. Creating a workspace never
    // reads customer data or assigns a real employee to an example request.
    const requestId='test-'+namespace+'-sample';
    db.prepare("INSERT INTO cleaning_requests(id,client_id,service,object_type,postcode,area,frequency,message,contact_name,email,phone,address,status,assigned_worker_id,scheduled_at,checklist,worker_note,customer_feedback,admin_reply,dedupe_scope,idempotency_key,payload_hash,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,'baureinigung','Baustelle','10115','50','Einmalig','TEST ONLY: synthetic job for trying the workflow','TEST · client',?,'','TEST location — no real address','scheduled',?,?,'[]','','','','test-workspace','initial-sample','synthetic-fixture','test-workspace-v1',?,?,1,'test-workspace-seed') ON CONFLICT(id) DO NOTHING")
      .run(requestId,people.client.id,people.client.email,people.worker.id,now,now,now);
    db.prepare("UPDATE cleaning_requests SET scheduled_at=? WHERE id=? AND status='scheduled' AND scheduled_at IS NULL AND last_mutation='test-workspace-seed' AND version=1 AND dedupe_scope='test-workspace'").run(now,requestId);
    db.prepare("UPDATE cleaning_requests SET assigned_bauleiter_id=? WHERE id=? AND assigned_bauleiter_id IS NULL AND last_mutation='test-workspace-seed' AND version=1 AND dedupe_scope='test-workspace'").run(people.bauleiter.id,requestId);
    db.exec('COMMIT');
    return people;
  }catch(error){db.exec('ROLLBACK');throw error;}
}

export function createDeveloperWorkspaceRegistry(primaryPath){
  const opened=new Map();
  return {
    get(user){
      if(!user?.id)throw Error('Developer identity required');
      const key=createHash('sha256').update(user.id).digest('hex');
      if(opened.has(key))return opened.get(key);
      const directory=join(dirname(primaryPath),'developer-workspaces');
      mkdirSync(directory,{recursive:true,mode:0o700});
      if(lstatSync(directory).isSymbolicLink())throw Error('Unsafe test workspace directory');
      const path=join(directory,key+'.sqlite');
      try{if(lstatSync(path).isSymbolicLink())throw Error('Unsafe test database');}catch(error){if(error.code!=='ENOENT')throw error;}
      const local=openLocalDatabase(path,{allowMigrations:true});
      try{
        chmodSync(path,0o600);
        const people=seed(local.db,key.slice(0,12));
        const workspace={...local,people,path};
        opened.set(key,workspace);
        return workspace;
      }catch(error){local.db.close();throw error;}
    },
    close(){for(const value of opened.values())value.db.close();opened.clear();}
  };
}
