import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';

const root='/workspace/scratch/c56161c95e04/knaba-federation-login';
const require=createRequire(root+'/erp/package.json'),ts=require('typescript');
const path=root+'/erp/apps/web/src/FederationLogin.tsx',source=readFileSync(path,'utf8');
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
console.log(JSON.stringify({scope:'Actual source-extracted handler and actual parser; network doubles only',sourceSha256:createHash('sha256').update(source).digest('hex')}));

async function run(fresh){
  const completed=[],state={error:undefined,unknown:false,unknownWeb:false,request:'initial',confirmed:true,busy:false};
  const context={
    request:{requestId:'11111111-1111-4111-8111-111111111111',state:'SOURCE_APPROVED',version:3,client:{kind:'WEB'},csrfToken:'flow-csrf'},
    configuration:{enabled:true},confirmed:true,busy:false,unknown:false,online:true,otp:'',
    begin:()=>({controller:new AbortController(),serial:1}),current:()=>true,
    federationRequest:async()=>issued,api:async()=>fresh,clearSession:()=>{},
    webAuthorizationResponse:model.webAuthorizationResponse,nativeAuthorizationResponse:model.nativeAuthorizationResponse,ApiError,
    onComplete:(session,path)=>completed.push({session,path}),
    setBusy:value=>{state.busy=value;},setError:value=>{state.error=value;},setOtp:()=>{},
    setUnknownWeb:value=>{state.unknownWeb=value;},setFinished:()=>{},setRequest:value=>{state.request=value;},
    setConfirmed:value=>{state.confirmed=value;},setUnknown:value=>{state.unknown=value;},
  };
  runInNewContext(compiled,context);await context.__confirm();return {state,completed};
}
for(const [name,csrfToken] of [['different same-user session','old-token-derived-csrf'],['missing session proof',undefined]]){
  test('WEB confirm rejects '+name+' through the explicit unknown-result recovery',async()=>{
    const {state,completed}=await run({...issued,csrfToken});
    assert.equal(completed.length,0);assert.ok(state.error instanceof ApiError,'must be the intentional contract error, not a missing test stub');
    assert.equal(state.error.code,'FEDERATION_CONFLICT');assert.equal(state.error.status,409);
    assert.equal(state.unknown,true);assert.equal(state.unknownWeb,true);assert.equal(state.request,null);
    assert.equal(state.confirmed,false);assert.equal(state.busy,false);
  });
}
test('WEB confirm accepts the current session proof matching the actual issued response',async()=>{
  const fresh={...issued}, {state,completed}=await run(fresh);
  assert.equal(completed.length,1);assert.equal(completed[0].session,fresh);assert.equal(completed[0].path,'/console');
  assert.equal(state.error,undefined);assert.equal(state.unknown,false);assert.equal(state.unknownWeb,false);assert.equal(state.busy,false);
});
