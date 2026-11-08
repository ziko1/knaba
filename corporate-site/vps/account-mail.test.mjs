import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAccountMailer} from './account-mail.mjs';

const origin='https://knaba.example.test';
const environment=()=>({KNABA_ACCOUNT_EMAIL_ENABLED:'approved',KNABA_ACCOUNT_EMAIL_FROM:'KnaBa <accounts@example.test>',
  RESEND_API_KEY:'synthetic-key-not-a-credential',KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'20'});
const message=(extra={})=>({kind:'password_reset',email:'synthetic@example.test',token:'A'.repeat(43),locale:'uk',
  idempotencyKey:'synthetic-idempotency-key-12345',...extra});

test('account mail defaults disabled and requires explicit approval, sender, budget, secret and trusted HTTPS origin',async()=>{
  let calls=0;
  const transport=async()=>{calls++;return Response.json({id:'synthetic_123'});};
  const cases=[{}, {...environment(),KNABA_ACCOUNT_EMAIL_ENABLED:'true'},
    {...environment(),RESEND_API_KEY:''},{...environment(),KNABA_ACCOUNT_EMAIL_FROM:'invalid'},
    {...environment(),KNABA_ACCOUNT_EMAIL_FROM:'Name\r\nInjected <a@example.test>'},
    {...environment(),KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'0'},
    {...environment(),KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'101'},
    {...environment(),KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'2.5'}];
  for(const env of cases){
    const mail=createAccountMailer({environment:env,origin,transport});
    assert.equal(mail.enabled,false);assert.equal(mail.dailyLimit,0);
    assert.deepEqual(await mail.send(message()),{status:'disabled'});
    assert.equal(mail.schedule(()=>{calls++;}),false);await mail.close();
  }
  for(const target of ['http://knaba.example.test','https://knaba.example.test/path','https://other:password@knaba.example.test','https://knaba.example.test/?foo=1']){
    const mail=createAccountMailer({environment:environment(),origin:target,transport});
    assert.equal(mail.enabled,false);await mail.close();
  }
  assert.equal(calls,0);
});

test('mail uses pinned endpoint, no redirects, bounded deadline and idempotency header; capability remains in fragment',async()=>{
  const sent=[];
  const mail=createAccountMailer({environment:environment(),origin,transport:async(url,options)=>{
    sent.push({url,options});return Response.json({id:'synthetic_receipt_123'});
  }});
  assert.equal(mail.enabled,true);assert.equal(mail.dailyLimit,20);
  assert.deepEqual(await mail.send(message()),{status:'accepted'});
  assert.deepEqual(await mail.send(message({kind:'email_change',locale:'en'})),{status:'accepted'});
  for(const [index,entry] of sent.entries()){
    assert.equal(entry.url,'https://api.resend.com/emails');assert.equal(entry.options.redirect,'error');
    assert.equal(entry.options.method,'POST');assert.ok(entry.options.signal instanceof AbortSignal);
    assert.equal(entry.options.headers['Idempotency-Key'],message().idempotencyKey);
    const body=JSON.parse(entry.options.body);assert.deepEqual(body.to,['synthetic@example.test']);
    const link=new URL(body.text.match(/https:\/\/\S+/)[0]);
    assert.equal(link.origin,origin);assert.equal(link.pathname,index===0?'/reset-password/':'/account/email/confirm/');
    assert.equal(link.searchParams.has('token'),false);assert.equal(link.hash,'#token='+message().token);
    assert.ok(!body.subject.includes(message().token));assert.match(body.text,/30/);
  }
  await mail.close();
});

test('all six account locales produce localized bounded plain-text email',async()=>{
  const subjects=[];
  const mail=createAccountMailer({environment:environment(),origin,transport:async(_url,options)=>{
    const body=JSON.parse(options.body);subjects.push(body.subject);assert.equal(Object.hasOwn(body,'html'),false);
    assert.ok(body.text.length<1500);return Response.json({id:'synthetic_receipt_123'});
  }});
  for(const locale of ['de','en','pl','lt','ru','uk'])assert.deepEqual(await mail.send(message({locale})),{status:'accepted'});
  assert.equal(new Set(subjects).size,6);await mail.close();
});

test('invalid recipient, token, kind, locale or idempotency key never reaches the provider',async()=>{
  let calls=0;
  const mail=createAccountMailer({environment:environment(),origin,transport:async()=>{calls++;return Response.json({id:'synthetic_receipt_123'});}});
  for(const extra of [{email:'invalid'},{token:'short'},{kind:'arbitrary'},{locale:'fr'},{idempotencyKey:'bad\r\nkey'}])
    assert.deepEqual(await mail.send(message(extra)),{status:'failed'});
  assert.equal(calls,0);await mail.close();
});

test('provider success requires a valid small receipt; unknown outcomes are never retried',async()=>{
  for(const response of [()=>new Response('not JSON',{status:200}),()=>Response.json({}),()=>Response.json({id:'short'}),
    ()=>new Response('',{status:503}),()=>new Response('',{status:408}),()=>new Response('',{status:429})]){
    let calls=0;
    const mail=createAccountMailer({environment:environment(),origin,transport:async()=>{calls++;return response();}});
    assert.deepEqual(await mail.send(message()),{status:'unknown'});assert.equal(calls,1);await mail.close();
  }
  let calls=0;
  const rejected=createAccountMailer({environment:environment(),origin,transport:async()=>{calls++;return new Response('',{status:422});}});
  assert.deepEqual(await rejected.send(message()),{status:'failed'});assert.equal(calls,1);await rejected.close();
});

test('oversized receipt is cancelled before parsing and is an unknown outcome',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(9000));},cancel(){cancelled=true;}});
  const mail=createAccountMailer({environment:environment(),origin,transport:async()=>new Response(stream,{status:200})});
  assert.deepEqual(await mail.send(message()),{status:'unknown'});assert.equal(cancelled,true);await mail.close();
});

test('a stalled provider has a hard five-second bound and aborts without retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let signal,calls=0;
  const mail=createAccountMailer({environment:environment(),origin,transport:async(_url,options)=>{
    calls++;signal=options.signal;return new Promise(()=>{});
  }});
  const pending=mail.send(message());t.mock.timers.tick(5001);
  assert.deepEqual(await pending,{status:'unknown'});assert.equal(signal.aborted,true);assert.equal(calls,1);await mail.close();
});

test('only four provider operations may be in flight and overflow does not start another call',async()=>{
  let finish,calls=0;
  const gate=new Promise(resolve=>{finish=resolve;});
  const mail=createAccountMailer({environment:environment(),origin,transport:async()=>{calls++;await gate;return Response.json({id:'synthetic_receipt_123'});}});
  const sending=Array.from({length:4},()=>mail.send(message()));
  assert.deepEqual(await mail.send(message()),{status:'failed'});assert.equal(calls,4);
  finish();assert.deepEqual(await Promise.all(sending),Array.from({length:4},()=>({status:'accepted'})));await mail.close();
});

test('recovery scheduling is bounded and deferred; close prevents new jobs and drains accepted tasks',async()=>{
  let runs=0;
  const mail=createAccountMailer({environment:environment(),origin,transport:async()=>Response.json({id:'synthetic_receipt_123'})});
  for(let i=0;i<4;i++)assert.equal(mail.schedule(async()=>{runs++;}),true);
  assert.equal(runs,0);assert.equal(mail.schedule(()=>{runs++;}),false);
  await mail.drain();assert.equal(runs,4);
  await mail.close();assert.equal(mail.enabled,false);assert.equal(mail.schedule(()=>{runs++;}),false);
  assert.deepEqual(await mail.send(message()),{status:'disabled'});
});

test('turning delivery off is honored for later attempts on the same mailer instance',async()=>{
  const env=environment();let calls=0;
  const mail=createAccountMailer({environment:env,origin,transport:async()=>{calls++;return Response.json({id:'synthetic_receipt_123'});}});
  assert.deepEqual(await mail.send(message()),{status:'accepted'});
  env.KNABA_ACCOUNT_EMAIL_ENABLED='disabled';
  assert.equal(mail.enabled,false);assert.equal(mail.dailyLimit,0);
  assert.deepEqual(await mail.send(message()),{status:'disabled'});assert.equal(calls,1);await mail.close();
});
