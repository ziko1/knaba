import {Injectable,type CallHandler,type ExecutionContext,type NestInterceptor} from '@nestjs/common';
import {catchError,mergeMap,type Observable} from 'rxjs';
import {DomainError} from '../../packages/domain/core.ts';
import {assertResponseAuthority,commitAuthorityResponseHeaders,discardAuthorityResponseHeaders} from './request-authority.ts';

/** Recheck the original proof after asynchronous work, before Nest emits JSON. */
@Injectable()
export class RequestAuthorityInterceptor implements NestInterceptor {
 intercept(context:ExecutionContext,next:CallHandler):Observable<unknown>{
  const http=context.switchToHttp(),req=http.getRequest(),res=http.getResponse();
  return next.handle().pipe(mergeMap(async result=>{
   // File and SSE handlers own their egress and check before send/write.
   if(!res.headersSent){await assertResponseAuthority(req,result);commitAuthorityResponseHeaders(req);}
   return result;
  }),catchError(async error=>{
   discardAuthorityResponseHeaders(req);
   // A typed error can also carry resource details. A revoked original proof
   // must reach the existing exception filter only as its opaque reauth error.
   if(!res.headersSent&&!(error instanceof DomainError&&error.code==='NEEDS_REAUTH'))await assertResponseAuthority(req);
   throw error;
  }));
 }
}
