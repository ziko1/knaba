/** Isolated HTTPS/SQLite fixture. Never reads a live database or provider configuration. */
import {mkdtemp,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer as httpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {openLocalDatabase} from '../../vps/database.mjs';
import {createCredentialsUser,createSessionForUser,sessionCookie} from '../../vps/auth.mjs';
import {createKnabaVpsServer} from '../../vps/server.mjs';

export async function createRoleUxFixture({releaseEnvironment={},localTest=false}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-role-ux-'));
  const database=join(directory,'synthetic.sqlite');
  const password='Synthetic-browser-only-2026';
  const identities={};
  let app,proxy;
  try{
    // A runner without openssl can mount a dedicated, ephemeral localhost TLS
    // directory read-only. Its files are never copied into receipts or the repo.
    const tlsDirectory=process.env.KNABA_ROLE_QA_TLS_DIR||directory;
    if(!process.env.KNABA_ROLE_QA_TLS_DIR){
      execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
        '-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),
        '-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
      await chmod(join(directory,'key.pem'),0o600);
    }
    const conversationId=randomUUID();
    const initial=openLocalDatabase(database);
    try{
      const now=new Date().toISOString();
      for(const role of ['owner','developer','admin','client','worker','partner','bauleiter','client2','pending','suspended']){
        const user=createCredentialsUser(initial.db,role+'@example.test',password);
        identities[role]=user;
        if(role==='developer'){
          initial.db.prepare("INSERT INTO vps_staff_grants(user_id,email,purpose,active,enrolled_at) VALUES (?,?,'developer',1,?)")
            .run(user.id,user.email,now);
          continue;
        }
        if(role==='owner')continue;
        const approvedRole=role==='client2'?'client':role==='pending'||role==='suspended'?'worker':role;
        const requested=approvedRole==='admin'?'client':approvedRole;
        const status=role==='pending'?'pending':role==='suspended'?'suspended':'approved';
        initial.db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES(?,?,?,?,?,?,?,?,?,1,?)')
          .run(user.id,'QA '+role+' · Long project coordination name for mobile layout',user.email,requested,
            status==='pending'?null:approvedRole,status,'2026-10-28',now,now,'fixture-'+role);
      }
      // A real, nonempty inbox layout without invoking AI, providers or messaging.
      initial.db.prepare('INSERT INTO assistant_conversations(id,token_hash,locale,status,contact_name,contact_email,contact_phone,privacy_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(conversationId,createHash('sha256').update(randomUUID()).digest('hex'),'en','human',
          'QA synthetic coordination contact with a deliberately long layout label','inbox@example.test','','2026-10-28',now,now);
      initial.db.prepare('INSERT INTO assistant_messages(id,conversation_id,sender,kind,content,request_key,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(randomUUID(),conversationId,'customer','text','Synthetic browser fixture: please coordinate the agreed site work and access.','fixture-message',now);
    }finally{initial.db.close();}
    proxy=httpsServer({key:await readFile(join(tlsDirectory,'key.pem')),cert:await readFile(join(tlsDirectory,'cert.pem'))},(req,res)=>{
      if(!app){res.writeHead(503);res.end('Synthetic fixture starting');return;}
      const upstream=httpRequest({hostname:'127.0.0.1',port:app.port,path:req.url,method:req.method,
        headers:{...req.headers,'x-forwarded-proto':'https'}},reply=>{
        res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
      });
      upstream.on('error',()=>{res.writeHead(502);res.end('Synthetic proxy unavailable');});
      req.pipe(upstream);
    });
    await new Promise((resolve,reject)=>{proxy.listen(0,'127.0.0.1',resolve);proxy.once('error',reject);});
    const origin='https://127.0.0.1:'+proxy.address().port;
    app=await createKnabaVpsServer({dbPath:database,
      staticRoot:fileURLToPath(new URL('../../dist/client/',import.meta.url)),
      workerPath:new URL('../../dist/server/index.js',import.meta.url).href,
      host:'127.0.0.1',port:0,origin,ownerEmail:identities.owner.email,developerEmail:identities.developer.email,
      localTest,oidcConfig:{},releaseEnvironment});
    const cookies={};
    for(const [role,user] of Object.entries(identities)){
      cookies[role]=sessionCookie(createSessionForUser(app.db,user.id).token).split(';')[0];
    }
    async function api(role,path,method='GET',body){
      if(!path.startsWith('/api/')||path.startsWith('//'))throw Error('Fixture API requires a local API path');
      const payload=body===undefined?undefined:JSON.stringify(body);
      // Node fetch can replace Host with the upstream socket address. Keep the
      // real HTTPS edge Host/Origin contract while connecting to local HTTP.
      const response=await new Promise((resolve,reject)=>{
        const request=httpRequest({hostname:'127.0.0.1',port:app.port,path,method,
          headers:{Host:new URL(origin).host,Origin:origin,'X-Forwarded-Proto':'https',
            'X-KnaBa-Request':'portal-v1','Content-Type':'application/json',Cookie:cookies[role]??'',
            ...(payload===undefined?{}:{'Content-Length':Buffer.byteLength(payload)})}},reply=>{
          const chunks=[];reply.on('data',chunk=>chunks.push(chunk));reply.on('error',reject);
          reply.on('end',()=>{
            try{
              const headers=new Headers();
              for(const [name,value] of Object.entries(reply.headers)){
                if(Array.isArray(value))for(const item of value)headers.append(name,item);
                else if(value!==undefined)headers.set(name,value);
              }
              resolve(new Response(Buffer.concat(chunks),{status:reply.statusCode??502,headers}));
            }catch(error){reject(error);}
          });
        });
        request.on('error',reject);
        request.setTimeout(15000,()=>request.destroy(new Error('Synthetic fixture API timeout')));
        request.end(payload);
      });
      const data=await response.json();
      if(!response.ok)throw Error('Fixture API '+path.split('?')[0]+' returned HTTP '+response.status+' ('+(data.error?.code||'unknown')+')');
      return data;
    }
    const requests={};
    for(const role of ['client','client2','partner']){
      const result=await api(role,'/api/portal/requests','POST',{
        service:'baureinigung',objectType:'Baustelle',postcode:'10315',area:'250',frequency:'Einmalig',
        message:'QA '+role+' project: original synthetic request for complete role workflow.',
        address:'Synthetic street 1',privacyAccepted:true,idempotencyKey:crypto.randomUUID()});
      requests[role]=result.request;
    }
    let current=requests.client;
    current=(await api('owner','/api/portal/requests/'+current.id,'PATCH',{
      version:current.version,status:'reviewing',assignedBauleiterId:identities.bauleiter.id})).request;
    current=(await api('admin','/api/portal/requests/'+current.id,'PATCH',{
      version:current.version,status:'scheduled',assignedWorkerId:identities.worker.id,
      scheduledAt:'2026-11-04T09:00:00.000Z'})).request;
    requests.client=current;
    // Authentication sessions and rate limits legitimately change during login.
    // Hash every other primary table, including users/grants, without exposing
    // even synthetic credentials in browser receipts.
    function primarySnapshot(){
      const tables=app.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
        .map(row=>row.name).filter(name=>/^[A-Za-z0-9_]+$/.test(name)&&!name.startsWith('sqlite_')&&!['vps_sessions','vps_login_limits'].includes(name));
      return Object.fromEntries(tables.map(name=>{
        const rows=app.db.prepare('SELECT * FROM "'+name+'"').all().map(row=>JSON.stringify(row)).sort();
        return [name,{rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];
      }));
    }
    return {origin,password,identities,requests,conversationId,api,db:app.db,primarySnapshot,
      async close(){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));
        await app.close();await rm(directory,{recursive:true,force:true});}};
  }catch(error){
    if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
    if(app)await app.close();
    await rm(directory,{recursive:true,force:true});throw error;
  }
}
