import express,{type Request,type Response,type RequestHandler} from 'express';
import {assert,DomainError} from '../../packages/domain/core.ts';
import {FEDERATION_ERP_PATH,FEDERATION_MAX_BYTES,FederationProtocolError,makeFederationResponse,verifyFederationRequest,type VerifiedFederationRequest} from '../../packages/integrations/site-federation-protocol.mjs';
import {RateLimiter} from './auth.ts';
import {FederationAuthorities} from './site-federation-config.ts';
import type {FederationResult} from './site-federation-ledger.ts';

type FederationRequest=Request&{federationRawBody?:Buffer};
/** Mount before global JSON parsing. The untrusted body is never parsed/logged. */
export function federationRawBody():RequestHandler {
 const raw=express.raw({type:'application/json',limit:FEDERATION_MAX_BYTES,inflate:false,verify:(req:FederationRequest,_res,bytes)=>{req.federationRawBody=bytes;}});
 return (req,res,next)=>raw(req,res,(error?:any)=>{
  if(error){res.setHeader('Cache-Control','no-store');res.status(error.type==='entity.too.large'?413:400).json({ok:false,error:{code:'FEDERATION_INVALID'}});return;}
  // Ordinary structural validators must not traverse the raw byte buffer. The
  // dedicated signature verifier owns its 32KiB and canonical-JSON validation.
  req.body=undefined;next();
 });
}
export function federationHttpStatus(code:string){
 if(['FEDERATION_AUTH_FAILED','NEEDS_REAUTH','ACCESS_DENIED'].includes(code))return 401;
 if(['FEDERATION_GENERATION','FEDERATION_CONFLICT','FEDERATION_RECONCILING','FEDERATION_REPLAY','VERSION_CONFLICT'].includes(code))return 409;
 if(code==='RATE_LIMITED')return 429;
 if(code==='FEDERATION_UNAVAILABLE')return 503;
 return 400;
}
export function federationIngress(authorities:()=>FederationAuthorities,handle:(request:VerifiedFederationRequest)=>Promise<FederationResult>){
 const limiter=new RateLimiter(240,60000);
 return async(req:FederationRequest,res:Response)=>{
  let verified:VerifiedFederationRequest|undefined;
  const authorityId=req.headers['x-knaba-federation-authority'];
  const config=typeof authorityId==='string'?authorities().get(authorityId):undefined;
  res.setHeader('Cache-Control','no-store');
  if(!config){res.status(404).json({ok:false,error:{code:'FEDERATION_UNAVAILABLE'}});return;}
  try{
   assert(req.method==='POST'&&req.originalUrl===FEDERATION_ERP_PATH,'FEDERATION_AUTH_FAILED');
   verified=verifyFederationRequest(config,'SITE_TO_ERP',req.headers,req.federationRawBody!);
   limiter.check(config.authorityId+'\0'+verified.envelope.action);
   const result=await handle(verified);authorities().require(config.authorityId,verified.configFingerprint);
   const response=makeFederationResponse(config,verified,result,result.ok?200:federationHttpStatus(result.error.code));
   res.status(response.status).set(response.headers).send(response.body);
  }catch(error){
   const code=error instanceof DomainError||error instanceof FederationProtocolError?error.code:'FEDERATION_UNAVAILABLE';
   const body={ok:false,error:{code}},status=federationHttpStatus(code);
   if(verified&&authorities().get(config.authorityId)===config){const response=makeFederationResponse(config,verified,body,status);res.status(status).set(response.headers).send(response.body);}
   else res.status(status).json(body);
  }
 };
}
