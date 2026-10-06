export const INTERNAL_API_ORIGIN: 'http://api.railway.internal:3000';
export function verifyWorkerRelease(release:{code_sha?:string;source_dirty?:boolean|null;source_provenance?:string}|null,expectedSha:string):{codeSha:string;sourceDirty:boolean|null;sourceProvenance:string};
export interface WorkerGateOptions {
 expectedSha:string;
 mode?:'DEMO'|'TEST';
 request?:(url:string,options:RequestInit)=>Promise<Response>;
 wait?:(milliseconds:number)=>Promise<void>;
 now?:()=>number;
 deadlineMs?:number;
 stopped?:()=>boolean;
}
export function waitForExpectedApi(options:WorkerGateOptions):Promise<{ready:true;expectedSha:string;mode:'DEMO'|'TEST'}>;
