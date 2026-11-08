'use strict';
// Child-process test fixture only. These traps make the actual entrypoint
// observable without opening PostgreSQL, contacting a provider or running a
// worker interval. Reaching PG_POOL is a positive boundary control, not SQL PASS.
const {writeFileSync}=require('node:fs');
const pg=require('pg');
const net=require('node:net');
const timers=require('node:timers');
const {syncBuiltinESMExports}=require('node:module');
const tracePath=process.env.KNABA_RUNTIME_MODE_TRACE;
if(!tracePath)throw new Error('SYNTHETIC_MODE_TRACE_REQUIRED');
const trace={scope:'EXPLICIT_PG_NETWORK_INTERVAL_TRAPS',events:[],queries:[]};
const save=()=>writeFileSync(tracePath,JSON.stringify(trace));
save();
function boundary(name){
  trace.events.push(name);save();
  throw new Error('SYNTHETIC_STARTUP_BOUNDARY:'+name);
}
// Optional explicit SQL double permits only the GPS read so canonical origin
// propagation can reach the real peer comparison. Never executes real SQL.
const allowGps=process.env.KNABA_RUNTIME_MODE_ALLOW_GPS_QUERY==='true';
pg.Pool=class RuntimeModePoolTrap{
  constructor(){if(!allowGps)boundary('PG_POOL');trace.events.push('PG_POOL');save();}
  on(){return this;}
  query(sql,params){
    trace.queries.push({sql,params});save();
    if(allowGps&&sql==='SELECT knaba_assert_gps_storage_safe($1::text)'){
      trace.events.push('GPS_STORAGE_QUERY');save();return Promise.resolve({rows:[]});
    }
    if(allowGps&&sql==='SELECT id,site_expires_at FROM site_identity_challenges LIMIT 0')boundary('SITE_IDENTITY_SCHEMA_QUERY');
    return boundary('UNEXPECTED_PG_QUERY');
  }
  connect(){return boundary('PG_CONNECT');}
};
globalThis.fetch=async()=>boundary('FETCH');
net.Socket.prototype.connect=function(){return boundary('SOCKET_CONNECT');};
globalThis.setInterval=timers.setInterval=function(){return boundary('INTERVAL');};
syncBuiltinESMExports();
