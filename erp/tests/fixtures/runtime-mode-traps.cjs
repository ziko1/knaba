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
const trace={scope:'EXPLICIT_PG_NETWORK_INTERVAL_TRAPS',events:[]};
const save=()=>writeFileSync(tracePath,JSON.stringify(trace));
save();
function boundary(name){
  trace.events.push(name);save();
  throw new Error('SYNTHETIC_STARTUP_BOUNDARY:'+name);
}
pg.Pool=class RuntimeModePoolTrap{constructor(){boundary('PG_POOL');}};
globalThis.fetch=async()=>boundary('FETCH');
net.Socket.prototype.connect=function(){return boundary('SOCKET_CONNECT');};
globalThis.setInterval=timers.setInterval=function(){return boundary('INTERVAL');};
syncBuiltinESMExports();
