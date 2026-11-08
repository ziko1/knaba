import {Injectable,type NestInterceptor,type ExecutionContext,type CallHandler} from '@nestjs/common';
import {Observable,concatMap} from 'rxjs';
import type {Response} from 'express';
import {runRequestAuthority,verifyResponseAuthority} from './request-authority.ts';

// These routes have their own invitation/device-enrollment/server-signature
// checks, or expose public data. New handlers are protected by default.
const separateAuthority=new Set(['health','ready','version','login','demo','activate','publicConfig','publicLead','publicChat','mobileEnroll','integrationEvent','inspectSiteChallenge']);
@Injectable()
export class RequestAuthorityInterceptor implements NestInterceptor {
 intercept(host:ExecutionContext,next:CallHandler):Observable<unknown> {
  const response=host.switchToHttp().getResponse<Response>();
  const required=!separateAuthority.has(host.getHandler().name);
  return new Observable(subscriber=>runRequestAuthority(required,close=>{
   response.once('close',close);
   const subscription=next.handle().pipe(concatMap(async value=>{
    // Binary responses and SSE have explicit final checks before sending bytes.
    if(!response.headersSent)await verifyResponseAuthority(value);
    return value;
   })).subscribe(subscriber);
   return ()=>subscription.unsubscribe();
  }));
 }
}
