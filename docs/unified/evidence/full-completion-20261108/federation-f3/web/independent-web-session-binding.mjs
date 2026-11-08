import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';

const root='/workspace/scratch/c56161c95e04/knaba-federation-login';
const require=createRequire(root+'/erp/package.json');
const ts=require('typescript');
const path=root+'/erp/apps/web/src/FederationLogin.tsx';
const source=readFileSync(path,'utf8');
const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='confirm')handler=node;ts.forEachChild(node,visit);}
visit(parsed);assert.ok(handler,'production confirm handler must exist');
const compiled=ts.transpileModule('globalThis.__confirm='+handler.getText(parsed)+';',{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
}).outputText;
const model=await import(pathToFileURL(root+'/erp/apps/web/src/federationLoginModel.ts').href);
const {ApiError}=await import(pathToFileURL(root+'/erp/apps/web/src/api.ts').href);
const actor={userId:'same-user',companyId:'same-company',roles:['EMPLOYEE'],permissions:[],siteIds:[],customerIds:[],warehouseIds:[]};
const issued={actor,user:{id:actor.userId,name:'Synthetic'},mode:'TEST',csrfToken:'new-token-derived-csrf',expiresAt:'2099-01-01T00:00:00.000Z',returnPath:'/console'};
const old={...issued,csrfToken:'different-old-token-derived-csrf'};
const effects=[];
const context={
  request:{requestId:'11111111-1111-4111-8111-111111111111',state:'SOURCE_APPROVED',version:3,client:{kind:'WEB'},csrfToken:'flow-csrf'},
  configuration:{enabled:true},confirmed:true,busy:false,unknown:false,online:true,otp:'',
  begin:()=>({controller:new AbortController(),serial:1}),current:()=>true,
  federationRequest:async()=>issued,api:async()=>old,clearSession:()=>effects.push('clearSession'),
  webAuthorizationResponse:model.webAuthorizationResponse,nativeAuthorizationResponse:model.nativeAuthorizationResponse,ApiError,
  onComplete:()=>effects.push('completed-with-old-session'),
  setBusy:()=>{},setError:()=>{},setOtp:()=>{},setUnknownWeb:()=>{},setFinished:()=>{},setRequest:()=>{},setConfirmed:()=>{},setUnknown:()=>{},
};
runInNewContext(compiled,context);await context.__confirm();
console.log(JSON.stringify({scope:'Actual source-extracted WEB handler plus actual response parser; explicit network doubles, no browser',sourceSha256:createHash('sha256').update(source).digest('hex'),effects}));
assert.equal(effects.includes('completed-with-old-session'),false,'A fresh /me for another same-user session must not complete this issued flow');
