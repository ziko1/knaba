export interface Entity {id:string;kind:string;version:number;createdAt:string;updatedAt:string;data:Record<string,any>}
export interface Actor {userId:string;companyId:string;roles:string[];permissions:string[];siteIds:string[];customerIds:string[];warehouseIds:string[]}
export interface Session {actor:Actor;user:Record<string,any>;mode:string;csrfToken?:string}
export interface Schema {type?:string;properties?:Record<string,Schema>;required?:string[];enum?:any[];items?:Schema;anyOf?:Schema[];oneOf?:Schema[];default?:any;description?:string;format?:string;minimum?:number;maximum?:number;minLength?:number;maxLength?:number;minItems?:number;maxItems?:number;nullable?:boolean}
export interface Command {name:string;permission:string;highRisk?:boolean;schema:Schema}
export class ApiError extends Error {constructor(public code:string,public status:number,public details:Record<string,any>={}){super(code)}}
let csrfToken:string|undefined,guestCsrfToken:string|undefined,authenticationGeneration=0;
const authenticationFailures=new Set<()=>void>();
export function subscribeAuthenticationFailure(listener:()=>void){authenticationFailures.add(listener);return()=>{authenticationFailures.delete(listener)}}
export function clearSession(){authenticationGeneration++;csrfToken=undefined;guestCsrfToken=undefined;}
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
 const guest=path.startsWith('/api/v1/public/'),auth=path.startsWith('/api/v1/auth/'),generation=authenticationGeneration,proof=guest?guestCsrfToken:csrfToken;
 const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(proof?{'X-CSRF-Token':proof}:{}),...options.headers}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok){
  const code=body.code||body.error?.code||body.message||'REQUEST_FAILED';
  // An old request must never revoke a subsequently adopted login. Scoped 403
  // denials and unsuccessful login/guest requests are not session boundaries.
  if(response.status===401&&code!=='NEEDS_APPROVAL'&&!guest&&!auth&&generation===authenticationGeneration){authenticationGeneration++;csrfToken=undefined;for(const listener of authenticationFailures)listener()}
  throw new ApiError(code,response.status,body.details||body.error?.details||{});
 }
 if(guest){if(body.csrfToken)guestCsrfToken=body.csrfToken;return body as T;}
 if(generation===authenticationGeneration){
  if(auth&&['/api/v1/auth/login','/api/v1/auth/demo','/api/v1/auth/activate'].includes(path)){authenticationGeneration++;csrfToken=undefined;}
  if(body.csrfToken)csrfToken=body.csrfToken;
 }
 return body as T;
}
export const entities=async(kind:string,options:RequestInit={})=>(await api<{items:Entity[]}>(`/api/v1/entities/${encodeURIComponent(kind)}`,options)).items;
export async function command(name:string,input:any,expectedVersion?:number,idempotencyKey:string=crypto.randomUUID()){return api(`/api/v1/commands/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify({input,expected_version:expectedVersion,idempotency_key:idempotencyKey})})}
export async function catalog(options:RequestInit={}):Promise<Command[]>{const result:any=await api('/api/v1/commands',options);const rows=Array.isArray(result)?result:result.items||result.commands||[];return Array.isArray(rows)?rows:Object.entries(rows).map(([name,data]:any)=>({name,...data}));}
