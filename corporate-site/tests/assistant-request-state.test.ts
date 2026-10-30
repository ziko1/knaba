import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createAssistantRequestState,sameAssistantTicket} from '../src/lib/assistant-request-state';
import {formatRecoveryCode,parseRecoveryCode,type AssistantTicket} from '../src/lib/assistant-recovery';

function deferred<T>() {
  let resolve!: (value:T)=>void;
  let reject!: (problem:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const ticket:AssistantTicket={id:'43bb00af-fccc-4495-ac32-b2e354190570',token:'a'.repeat(64)};
const recovered:AssistantTicket={id:'53bb00af-fccc-4495-ac32-b2e354190570',token:'b'.repeat(64)};
const event=()=>({preventDefault:vi.fn()}) as unknown as Event;
// Drain cross-realm await continuations after a deliberately released response.
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const offer={id:'offer-1',content:'Review these terms',state:'pending' as const};
type Thread={conversation:{id:string;status:'assistant'|'human'|'closed'};messages:unknown[];offers:unknown[]};
const snapshot=(label:string,id=ticket.id):Thread=>({conversation:{id,status:'assistant'},messages:[label],offers:[]});

// As with assistant-dialog.test.ts, exercise the actual TSX handlers without a
// JSX renderer. Signals, transport and storage are mocks; this is not browser QA.
const source=ts.createSourceFile('KnabaAssistant.tsx',readFileSync(new URL('../src/components/KnabaAssistant.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='KnabaAssistant');
const names=['load','ensure','send','handoff','decide','restore','reset','copyRecovery'];
const handlers=component?.body?.statements.filter((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&!!node.name&&names.includes(node.name.text));
if(handlers?.length!==names.length)throw new Error('Assistant request handlers are missing');
const output=ts.transpileModule(handlers.map(node=>node.getText(source)).join('\n')+`\nexports.handlers={${names.join(',')}};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
type Handlers={
  load:(value:AssistantTicket)=>Promise<void>;
  send:(event:Event)=>Promise<void>;
  handoff:(event:Event)=>Promise<void>;
  decide:(value:typeof offer,decision:'accepted'|'declined')=>Promise<void>;
  restore:(event:Event)=>Promise<void>;
  reset:()=>void;
  copyRecovery:()=>Promise<void>;
};
function fixture(initialTicket:AssistantTicket|null=ticket){
  const state={ticket:initialTicket,thread:null as Thread|null,open:true,draft:'First question',key:'',accepted:true,busy:false,error:'',human:true,name:'Visitor',email:'visitor@example.invalid',phone:'',captchaStatus:'disabled',captchaToken:'',captchaResetVersion:0,recoveryInput:'',codeCopied:false};
  const bindings:Record<string,unknown>={};
  for(const name of Object.keys(state) as (keyof typeof state)[]){
    bindings[name]=()=>state[name];
    bindings[`set${name[0].toUpperCase()}${name.slice(1)}`]=(value:unknown)=>{
      (state as Record<string,unknown>)[name]=typeof value==='function'?value(state[name]):value;
    };
  }
  const calls:{path:string;method:string;data:unknown;token:string|undefined;signal:AbortSignal;result:ReturnType<typeof deferred<unknown>>}[]=[];
  const http=vi.fn((path:string,method:string,data:unknown,token:string|undefined,signal:AbortSignal)=>{
    const result=deferred<unknown>();calls.push({path,method,data,token,signal,result});return result.promise;
  });
  const requests=createAssistantRequestState();
  const storage={setItem:vi.fn(),removeItem:vi.fn()};
  const stopSpeech=vi.fn(),confirm=vi.fn(()=>true),prompt=vi.fn();
  const clipboard=deferred<void>();
  const exports={} as {handlers:Handlers};
  let nextKey=0;
  runInNewContext(output,{...bindings,exports,http,requests,sameAssistantTicket,parseRecoveryCode,formatRecoveryCode,sessionStorage:storage,STORAGE:'ticket-test',locale:'en',t:{privacy:'privacy',captcha:'captcha',no:'connection',invalidCode:'invalid',fresh:'reset',manualCopy:'copy'},crypto:{randomUUID:()=>`request-${++nextKey}`},stopSpeech,window:{confirm,prompt},navigator:{clipboard:{writeText:()=>clipboard.promise}},Error});
  return {state,calls,requests,storage,stopSpeech,confirm,prompt,clipboard,...exports.handlers};
}

describe('assistant request sequencing',()=>{
  it('keeps only one poll in flight and requires the complete ticket identity',async()=>{
    const view=fixture();
    const first=view.load(ticket);
    await view.load(ticket);
    expect(view.calls).toHaveLength(1);
    view.state.ticket={...ticket,token:'c'.repeat(64)};
    view.calls[0].result.resolve(snapshot('wrong bearer'));
    await first;
    expect(view.state.thread).toBeNull();
    expect(sameAssistantTicket(null,ticket)).toBe(false);
  });

  it.each(['send','handoff','decide'] as const)('%s supersedes an old poll and blocks overlapping actions/polls',async action=>{
    const view=fixture();
    const old=view.load(ticket);
    const current=action==='decide'?view.decide(offer,'accepted'):view[action](event());
    await Promise.resolve();
    expect(view.calls[0].signal.aborted).toBe(true);
    expect(view.calls).toHaveLength(2);
    await Promise.all([view.load(ticket),view.send(event()),view.handoff(event()),view.decide(offer,'declined')]);
    expect(view.calls).toHaveLength(2);
    view.calls[1].result.resolve(snapshot('after action'));
    await current;
    view.calls[0].result.resolve(snapshot('before action'));
    await old;
    expect(view.state.thread?.messages).toEqual(['after action']);
    expect(view.state.busy).toBe(false);
    const fresh=view.load(ticket);
    view.calls[2].result.resolve(snapshot('owner reply'));
    await fresh;
    expect(view.state.thread?.messages).toEqual(['owner reply']);
  });

  it('ignores a cancelled poll failure without clearing a newer action error',async()=>{
    const view=fixture();
    const old=view.load(ticket),send=view.send(event());
    await Promise.resolve();
    view.calls[1].result.reject(new Error('503'));
    await send;
    expect(view.state.error).toBe('connection');
    view.calls[0].result.resolve(snapshot('old success'));
    await old;
    expect(view.state.error).toBe('connection');
    expect(view.state.thread).toBeNull();
    const next=view.load(ticket),handoff=view.handoff(event());
    await Promise.resolve();
    view.calls[2].result.reject(new Error('aborted poll'));
    await next;
    expect(view.state.error).toBe('');
    expect(view.state.busy).toBe(true);
    view.calls[3].result.resolve(snapshot('handoff'));
    await handoff;
  });

  it('captures the submitted message and preserves edits made while creating/sending',async()=>{
    const view=fixture(null);
    const send=view.send(event());
    view.state.draft='Next question';view.state.key='';
    view.calls[0].result.resolve(ticket);
    await flush();
    expect(view.calls[1].data).toEqual({content:'First question',idempotencyKey:'request-1'});
    view.calls[1].result.resolve(snapshot('sent'));
    await send;
    expect(view.state.draft).toBe('Next question');
    expect(view.state.key).toBe('');
  });

  it('retains the same idempotency key on retry and clears an unchanged successful draft',async()=>{
    const view=fixture();
    const first=view.send(event());await Promise.resolve();
    view.calls[0].result.reject(new Error('timeout'));
    await first;
    expect(view.state.draft).toBe('First question');
    expect(view.state.busy).toBe(false);
    const retry=view.send(event());await Promise.resolve();
    expect(view.calls[1].data).toEqual(view.calls[0].data);
    view.calls[1].result.resolve(snapshot('exactly once'));
    await retry;
    expect(view.state.draft).toBe('');
    expect(view.state.key).toBe('');
  });

  it('does not resurrect a reset conversation or send after an obsolete creation response',async()=>{
    const view=fixture(null);
    const old=view.send(event());
    view.reset();
    expect(view.calls[0].signal.aborted).toBe(true);
    expect(view.state.busy).toBe(false);
    expect(view.stopSpeech).toHaveBeenCalledOnce();
    view.state.accepted=true;view.state.captchaStatus='disabled';view.state.draft='New conversation';
    const current=view.send(event());
    view.calls[0].result.resolve(ticket);
    await old;
    expect(view.calls).toHaveLength(2);
    expect(view.state.ticket).toBeNull();
    expect(view.state.busy).toBe(true);
    expect(view.storage.setItem).not.toHaveBeenCalled();
    view.calls[1].result.resolve(recovered);
    await flush();
    view.calls[2].result.resolve(snapshot('new result',recovered.id));
    await current;
    expect(view.state.ticket).toEqual(recovered);
    expect(view.storage.setItem).toHaveBeenCalledExactlyOnceWith('ticket-test',JSON.stringify(recovered));
  });

  it.each(['send','handoff','decide'] as const)('ignores a %s response after reset, even when the same ticket is restored',async action=>{
    const view=fixture();
    const old=action==='decide'?view.decide(offer,'declined'):view[action](event());
    await Promise.resolve();
    view.reset();
    view.state.recoveryInput=formatRecoveryCode(ticket);
    const restore=view.restore(event());
    view.calls[1].result.resolve(snapshot('restored current'));
    await restore;
    view.calls[0].result.resolve(snapshot('obsolete mutation'));
    await old;
    expect(view.state.thread?.messages).toEqual(['restored current']);
    expect(view.state.ticket).toEqual(ticket);
  });

  it('validates recovery before adopting a ticket and ignores recovery results after reset',async()=>{
    const view=fixture(null);
    view.state.recoveryInput='invalid';
    await view.restore(event());
    expect(view.calls).toHaveLength(0);
    expect(view.state.error).toBe('invalid');
    view.state.recoveryInput=formatRecoveryCode(recovered);
    const failed=view.restore(event());
    expect(view.state.ticket).toBeNull();
    view.calls[0].result.reject(new Error('401'));
    await failed;
    expect(view.storage.setItem).not.toHaveBeenCalled();
    expect(view.state.busy).toBe(false);
    const old=view.restore(event());
    view.reset();
    view.calls[1].result.resolve(snapshot('old restore',recovered.id));
    await old;
    expect(view.state.ticket).toBeNull();
    expect(view.state.thread).toBeNull();
    expect(view.storage.setItem).not.toHaveBeenCalled();
  });

  it('preserves CAPTCHA retry handling and ignores stale CAPTCHA failures after reset',async()=>{
    const view=fixture(null);
    view.state.captchaStatus='pending';
    await view.send(event());
    expect(view.calls).toHaveLength(0);
    expect(view.state.error).toBe('captcha');
    view.state.captchaStatus='verified';view.state.captchaToken='verified-token';
    const failed=view.send(event());
    expect(view.calls[0].data).toMatchObject({privacyAccepted:true,captchaToken:'verified-token'});
    view.calls[0].result.reject(new Error('503'));
    await failed;
    expect(view.state.captchaStatus).toBe('pending');
    expect(view.state.captchaToken).toBe('');
    expect(view.state.captchaResetVersion).toBe(1);
    view.state.captchaStatus='verified';view.state.captchaToken='second-token';
    const old=view.send(event());view.reset();
    view.calls[1].result.reject(new Error('aborted'));
    await old;
    expect(view.state.captchaStatus).toBe('loading');
    expect(view.state.captchaResetVersion).toBe(2);
    expect(view.state.error).toBe('');
  });

  it.each(['resolve','reject'] as const)('disposal aborts in-flight work and ignores late %s callbacks',async outcome=>{
    const requests=createAssistantRequestState(),pending=deferred<string>();
    const callbacks={start:vi.fn(),success:vi.fn(),error:vi.fn(),finish:vi.fn()};
    let signal:AbortSignal|undefined;
    const running=requests.run('action',scope=>{signal=scope.signal;return pending.promise;},callbacks);
    const isCurrent=requests.checkpoint();
    requests.dispose();
    expect(signal?.aborted).toBe(true);
    expect(isCurrent()).toBe(false);
    pending[outcome]('late result');await running;
    expect(callbacks.success).not.toHaveBeenCalled();
    expect(callbacks.error).not.toHaveBeenCalled();
    expect(callbacks.finish).not.toHaveBeenCalled();
    const work=vi.fn(async()=> 'unused');
    await requests.run('poll',work,callbacks);
    expect(work).not.toHaveBeenCalled();
  });

  it('does not expose an obsolete recovery-code fallback after reset',async()=>{
    const view=fixture();
    const copy=view.copyRecovery();view.reset();
    view.clipboard.reject(new Error('denied'));await copy;
    expect(view.prompt).not.toHaveBeenCalled();
    expect(view.state.codeCopied).toBe(false);
  });
});
