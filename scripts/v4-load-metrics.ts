export interface HttpSample {kind:'READ'|'COMMAND';durationMs:number;status:number|null;}
export function percentile(values:readonly number[],quantile:number):number|null {
 if(!Number.isFinite(quantile)||quantile<=0||quantile>1||values.some(v=>!Number.isFinite(v)||v<0))throw Error('INVALID_METRIC');
 if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(quantile*sorted.length)-1]!;
}
export function summarizeHttp(samples:readonly HttpSample[]) {
 if(samples.some(s=>!['READ','COMMAND'].includes(s.kind)||s.status!==null&&(!Number.isInteger(s.status)||s.status<100||s.status>599)))throw Error('INVALID_METRIC');
 const p95Ms=percentile(samples.map(s=>s.durationMs),.95),p99Ms=percentile(samples.map(s=>s.durationMs),.99),fiveXx=samples.filter(s=>s.status!==null&&s.status>=500).length,successful=samples.filter(s=>s.status!==null&&s.status>=200&&s.status<300).length;
 return {requests:samples.length,successful,transportErrors:samples.filter(s=>s.status===null).length,fiveXx,fiveXxRatio:samples.length?fiveXx/samples.length:null,nonSuccess:samples.length-successful,p95Ms,p99Ms};
}
export interface LoadInputs {
 profile:'full'|'smoke';elapsedMs:number;employees:number;sites:number;sessions:number;activeSessions:number;timeSegments:number;
 plannedCommands:number;offeredCommands:number;acknowledgedCommands:number;verifiedCommands:number;invalidAcknowledgements:number;
 droppedOffers:number;aborted:boolean;sourceStayedPinned:boolean;samples:readonly HttpSample[];
}
export function evaluateCoreLoad(input:LoadInputs) {
 const counts=[input.employees,input.sites,input.sessions,input.activeSessions,input.timeSegments,input.plannedCommands,input.offeredCommands,input.acknowledgedCommands,input.verifiedCommands,input.invalidAcknowledgements,input.droppedOffers];
 if(!Number.isFinite(input.elapsedMs)||input.elapsedMs<0||counts.some(n=>!Number.isSafeInteger(n)||n<0)||input.verifiedCommands>input.acknowledgedCommands||input.acknowledgedCommands>input.offeredCommands)throw Error('INVALID_METRIC');
 const metrics=summarizeHttp(input.samples),commands=summarizeHttp(input.samples.filter(s=>s.kind==='COMMAND')),reads=summarizeHttp(input.samples.filter(s=>s.kind==='READ')),lostAcknowledgements=input.acknowledgedCommands-input.verifiedCommands;
 const gates={nonEmpty:metrics.requests>0&&commands.requests>0&&reads.requests>0,fullDuration:input.elapsedMs>=900000,fixture:input.employees===100&&input.sites===20&&input.sessions===100&&input.activeSessions===100&&input.timeSegments===100000,offeredWorkload:input.plannedCommands===9000&&input.offeredCommands===9000&&input.droppedOffers===0,observationsMatchWorkload:commands.requests===input.offeredCommands&&reads.successful>=input.activeSessions,acknowledgedThroughput:input.acknowledgedCommands>=8911,validAcknowledgements:input.invalidAcknowledgements===0,zeroAcknowledgedLoss:lostAcknowledgements===0,p95:metrics.p95Ms!==null&&metrics.p95Ms<=1000,p99:metrics.p99Ms!==null&&metrics.p99Ms<=3000,fiveXxBelowOnePercent:metrics.fiveXxRatio!==null&&metrics.fiveXxRatio<.01,completed:!input.aborted&&input.sourceStayedPinned};
 const status=!gates.nonEmpty?'NOT_RUN':input.profile==='smoke'?'PARTIAL_SMOKE_MEASURED':Object.values(gates).every(Boolean)?'PASSED':'FAILED';
 return {status,gates,metrics,commands,reads,lostAcknowledgements,acknowledgedCommands:input.acknowledgedCommands,verifiedCommands:input.verifiedCommands};
}
function origin(value:string) {
 let url:URL;try{url=new URL(value);}catch{throw Error('INVALID_LOAD_ORIGIN');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('INVALID_LOAD_ORIGIN');
 if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('LOAD_REQUIRES_HTTPS_OR_LOOPBACK');
 return url.origin;
}
export function loadConfiguration(env:Record<string,string|undefined>,profile:'full'|'smoke') {
 if(profile!=='full'&&profile!=='smoke')throw Error('INVALID_LOAD_PROFILE');
 if(env.KNABA_LOAD_ACK!=='SYNTHETIC_ISOLATED_DATABASE')throw Error('EXPLICIT_SYNTHETIC_ACK_REQUIRED');
 if(!['TEST','DEMO'].includes(env.APP_MODE??''))throw Error('LOAD_REQUIRES_TEST_DEMO');
 if(!/^[a-f0-9]{40}$/.test(env.EXPECTED_GIT_SHA??''))throw Error('EXACT_EXPECTED_GIT_SHA_REQUIRED');
 if(!/^knaba-v4-load-[a-z0-9][a-z0-9-]{7,70}$/.test(env.KNABA_LOAD_COMPANY_ID??''))throw Error('DEDICATED_LOAD_TENANT_REQUIRED');
 if(env.LIVE_SEND_ALLOWED!=='false'||env.LIVE_INTEGRATION_SEND_ALLOWED!=='false'||env.WHATSAPP_ACCESS_TOKEN||env.DEEPSEEK_API_KEY||env.INTEGRATION_CREDENTIALS_JSON)throw Error('LOAD_PROVIDER_CONFIGURATION_FORBIDDEN');
 if(!env.DATABASE_URL)throw Error('LOAD_DATABASE_REQUIRED');
 const baseOrigin=origin(env.KNABA_LOAD_BASE_URL??''),allowed=(env.KNABA_LOAD_ALLOWED_ORIGINS??'').split(',').filter(Boolean).map(origin);
 if(!allowed.includes(baseOrigin))throw Error('EXACT_LOAD_ORIGIN_ALLOWLIST_REQUIRED');
 return {profile,baseOrigin,expectedSha:env.EXPECTED_GIT_SHA!,companyId:env.KNABA_LOAD_COMPANY_ID!,mode:env.APP_MODE as 'TEST'|'DEMO',durationMs:profile==='full'?900000:15000,commandsPerSecond:10,employees:100,sites:20,sessions:100,timeSegments:100000,requestTimeoutMs:10000,readIntervalMs:5000};
}
