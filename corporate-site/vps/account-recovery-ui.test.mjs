import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {parse} from 'parse5';
import {accountRecoveryPage,accountResetPage,accountWords} from './account-recovery-ui.mjs';
const locales=['de','en','pl','lt','ru','uk'];
const attr=(node,name)=>node.attrs?.find(attribute=>attribute.name===name)?.value;
function nodes(root,predicate){
  const found=[];
  const walk=node=>{if(predicate(node))found.push(node);for(const child of node.childNodes??[])walk(child);};
  walk(root);return found;
}
const tags=(root,name)=>nodes(root,node=>node.tagName===name);
const byId=(root,id)=>nodes(root,node=>attr(node,'id')===id)[0];
const text=node=>node?.nodeName==='#text'?node.value:(node?.childNodes??[]).map(text).join('');
const namedControls=root=>nodes(root,node=>['input','select','textarea'].includes(node.tagName)&&attr(node,'name')).map(node=>attr(node,'name')).sort();
const formAt=(root,path)=>tags(root,'form').find(form=>attr(form,'action')?.startsWith(path+'?lang='));
function document(html){
  const errors=[];
  const tree=parse(html,{onParseError:error=>errors.push(error.code)});
  assert.deepEqual(errors,[],'rendered document must be valid HTML');
  return tree;
}
function accessibleFields(tree){
  const ids=nodes(tree,node=>attr(node,'id')).map(node=>attr(node,'id'));
  assert.equal(new Set(ids).size,ids.length,'all IDs must be unique within a page');
  for(const control of nodes(tree,node=>['input','select','textarea'].includes(node.tagName)&&attr(node,'type')!=='hidden')){
    const id=attr(control,'id');
    assert.ok(id,'visible controls need an ID');
    assert.ok(tags(tree,'label').some(label=>attr(label,'for')===id),'visible controls need a connected label: '+id);
  }
  for(const node of nodes(tree,node=>attr(node,'aria-describedby'))){
    for(const id of attr(node,'aria-describedby').split(/\s+/))assert.ok(byId(tree,id),'description exists: '+id);
  }
  assert.equal(tags(tree,'main').length,1);
  assert.equal(tags(tree,'h1').length,1);
  assert.ok(byId(tree,'account-main'));
}


for(const lang of locales){
  test('recovery pages are localized, labelled and safe for manual POST: '+lang,()=>{
    const w=accountWords(lang);
    for(const html of [accountRecoveryPage({lang,mailEnabled:true,error:w.validation}),accountResetPage({lang,error:w.invalidToken})]){
      const tree=document(html);
      assert.equal(attr(tags(tree,'html')[0],'lang'),lang);
      assert.equal(attr(tags(tree,'meta').find(node=>attr(node,'name')==='robots'),'content'),'noindex,nofollow');
      assert.doesNotMatch(html,/undefined|\[object Object\]/);accessibleFields(tree);
      for(const form of tags(tree,'form')){assert.equal(attr(form,'method'),'post');assert.ok(attr(form,'action').endsWith('?lang='+lang));}
      for(const input of tags(tree,'input').filter(node=>attr(node,'type')==='password')){
        assert.equal(attr(input,'value'),undefined);assert.equal(attr(input,'maxlength'),'256');
      }
      for(const link of tags(tree,'a'))assert.match(attr(link,'href'),/^(?:\/(?!\/)|#)/);
      assert.equal(tags(tree,'script').filter(node=>attr(node,'src')).length,0);
    }
    const recovery=document(accountRecoveryPage({lang,mailEnabled:true}));
    assert.deepEqual(namedControls(formAt(recovery,'/forgot-password/')),['email']);
    const disabled=document(accountRecoveryPage({lang}));
    assert.equal(tags(disabled,'form').length,0);assert.ok(text(disabled).includes(w.recoveryUnavailable));
    assert.ok(!byId(disabled,'account-notice'));
    const sent=document(accountRecoveryPage({lang,mailEnabled:true,sent:true}));
    assert.equal(tags(sent,'form').length,0);assert.equal(text(byId(sent,'account-notice')),w.recoverySent);
  });
}

test('all six recovery dictionaries are complete and immutable with a safe locale fallback',()=>{
  const expected=Object.keys(accountWords('de')).sort();
  assert.equal(expected.length,28);
  for(const lang of locales){
    const w=accountWords(lang);assert.deepEqual(Object.keys(w).sort(),expected);assert.ok(Object.isFrozen(w));
    for(const value of Object.values(w))assert.ok(typeof value==='string'&&value.trim().length>0);
  }
  for(const bad of ['<script>','__proto__','constructor'])assert.equal(accountWords(bad),accountWords('de'));
});

test('reset supports manual no-JS POST, never echoes secrets, and exposes no role/email-change controls',()=>{
  const html=accountResetPage({lang:'uk',token:'DO-NOT-ECHO-TOKEN',email:'DO-NOT-ECHO-EMAIL',newPassword:'DO-NOT-ECHO-PASSWORD'});
  const tree=document(html),form=formAt(tree,'/reset-password/'),input=byId(tree,'account-token');
  assert.deepEqual(namedControls(form),['confirm','new','token']);assert.equal(attr(input,'type'),'text');
  assert.equal(attr(input,'value'),undefined);assert.equal(attr(input,'required'),'');
  assert.equal(attr(input,'minlength'),'43');assert.equal(attr(input,'maxlength'),'43');assert.equal(attr(input,'autocomplete'),'off');
  assert.equal(attr(byId(tree,'account-token-entry'),'hidden'),undefined);assert.doesNotMatch(html,/DO-NOT-ECHO/);
  for(const node of [...tags(tree,'a'),...tags(tree,'form')])assert.doesNotMatch(attr(node,'href')??attr(node,'action'),/[?&#]token=/);
  const done=document(accountResetPage({lang:'uk',done:true}));assert.equal(tags(done,'form').length,0);
  assert.ok(text(byId(done,'account-notice')).includes(accountWords('uk').resetDone));
});

test('untrusted error and locale text cannot create HTML, attributes or reflected credentials',()=>{
  const payload='\"><img src=x onerror=attack()><script>attack()</script>';
  for(const html of [accountRecoveryPage({lang:payload,mailEnabled:true,error:payload}),accountResetPage({lang:payload,error:payload})]){
    const tree=document(html);assert.equal(attr(tags(tree,'html')[0],'lang'),'de');assert.equal(tags(tree,'img').length,0);
    assert.equal(text(byId(tree,'account-error')),payload);assert.doesNotMatch(html,/<img|<script>attack/);
    assert.equal(nodes(tree,node=>node.attrs?.some(item=>/^on/.test(item.name))).length,0);
  }
});
function tokenHarness(hash,{done=false}={}){
  const state={focused:false,navigations:[]};
  const field={type:'text',value:'',focus:()=>{state.focused=true;}};
  const entry={hidden:false},ready={hidden:true};
  const edit={addEventListener:(name,callback)=>{assert.equal(name,'click');state.edit=callback;}};
  const next={value:'',addEventListener:(name,callback)=>{assert.equal(name,'input');state.nextInput=callback;}};
  const confirm={value:'',dataset:{mismatchMessage:accountWords('uk').passwordMismatch},
    addEventListener:(name,callback)=>{assert.equal(name,'input');state.confirmInput=callback;},
    setCustomValidity:message=>{state.validation=message;}};
  const dom=done?{}:{'account-token':field,'account-token-entry':entry,'account-token-ready':ready,'account-token-edit':edit,'account-new':next,'account-confirm':confirm};
  const calls=[];
  const location={hash,pathname:'/reset-password/',search:'?lang=uk',
    replace:value=>{state.navigations.push(value);},reload:()=>{throw Error('Never replay a completed POST');}};
  const source=accountResetPage({lang:'uk',done});
  const script=text(tags(document(source),'script')[0]);
  runInNewContext(script,{
    document:{getElementById:id=>dom[id]??null},
    location,
    history:{replaceState:(...values)=>{calls.push(values);location.hash='';}},URLSearchParams,
    window:{addEventListener:(name,callback)=>{assert.equal(name,'hashchange');state.hashchange=callback;}},
    fetch:()=>{throw Error('Rendering a recovery link must not perform network requests');}
  });
  return {state,field,entry,ready,calls,next,confirm,location,changeHash(value){
    assert.equal(typeof state.hashchange,'function','same-document recovery must register a hashchange handler');
    location.hash=value;state.hashchange();
  }};
}

test('fragment enhancement clears history, fills one hidden POST field and offers manual replacement',()=>{
  const secret='aB09_-'.repeat(7)+'Z';
  assert.equal(secret.length,43);
  const result=tokenHarness('#token='+secret);
  assert.equal(result.field.value,secret);
  assert.equal(result.field.type,'hidden');
  assert.equal(result.entry.hidden,true);
  assert.equal(result.ready.hidden,false);
  assert.equal(result.calls.length,1);
  assert.equal(result.calls[0][2],'/reset-password/?lang=uk');
  assert.ok(!JSON.stringify(result.calls).includes(secret));
  result.state.edit();
  assert.equal(result.field.type,'text');
  assert.equal(result.field.value,'');
  assert.equal(result.entry.hidden,false);
  assert.equal(result.ready.hidden,true);
  assert.equal(result.state.focused,true);
});

test('ambiguous, malformed and absent fragments remain manual and never become hidden capabilities',()=>{
  const valid='a'.repeat(43);
  for(const hash of ['', '#token=short', '#token='+valid+'&token='+valid, '#token='+valid+'&extra=1', '#token='+valid+'%3Cscript%3E', '#token=%FF']){
    const result=tokenHarness(hash);
    assert.equal(result.field.value,'');
    assert.equal(result.field.type,'text');
    assert.equal(result.entry.hidden,false);
    assert.equal(result.ready.hidden,true);
    assert.equal(result.calls[0][2],'/reset-password/?lang=uk');
  }
});

test('same-document recovery binds a new capability and preserves ordinary skip navigation',()=>{
  const first='a'.repeat(43),second='b'.repeat(43),result=tokenHarness('#token='+first);
  result.next.value='typed-password';result.confirm.value='different';result.state.confirmInput();
  result.changeHash('#account-main');
  assert.equal(result.location.hash,'#account-main');assert.equal(result.field.value,first);
  assert.equal(result.next.value,'typed-password','ordinary anchor navigation preserves user input');
  result.changeHash('');assert.equal(result.field.value,first);
  result.changeHash('#token='+second);
  assert.equal(result.location.hash,'');assert.equal(result.field.value,second);
  assert.equal(result.field.type,'hidden');assert.equal(result.entry.hidden,true);assert.equal(result.ready.hidden,false);
  assert.equal(result.next.value,'');assert.equal(result.confirm.value,'');assert.equal(result.state.validation,'');
  assert.equal(result.state.navigations.length,0,'an existing reset form needs no document request');
  result.state.edit();result.changeHash('#token='+first);
  assert.equal(result.field.value,first);assert.equal(result.field.type,'hidden');
});

test('same-document malformed capabilities clear stale binding and passwords without network access',()=>{
  const token='a'.repeat(43);
  for(const invalid of ['#token=short','#token='+token+'&token='+token,'#token='+token+'&extra=1','#token=%FF','#token='+token+'%0A']){
    const result=tokenHarness('#token='+token);
    result.next.value='typed-password';result.confirm.value='different';result.state.confirmInput();
    result.changeHash(invalid);
    assert.equal(result.location.hash,'');assert.equal(result.field.value,'');assert.equal(result.field.type,'text');
    assert.equal(result.entry.hidden,false);assert.equal(result.ready.hidden,true);
    assert.equal(result.next.value,'');assert.equal(result.confirm.value,'');assert.equal(result.state.validation,'');
    assert.equal(result.state.navigations.length,0);
  }
});

test('recovery capability requires exactly 43 decoded characters including line terminators',()=>{
  for(const tail of ['%0A','%0D','%0D%0A','%E2%80%A8','%E2%80%A9']){
    const result=tokenHarness('#token='+'a'.repeat(43)+tail);
    assert.equal(result.field.value,'');assert.equal(result.field.type,'text');assert.equal(result.location.hash,'');
  }
});

test('completed recovery page reopens only a valid capability through a different GET route',()=>{
  const result=tokenHarness('',{done:true});
  assert.equal(result.state.navigations.length,0);result.changeHash('#account-main');assert.equal(result.location.hash,'#account-main');
  for(const fragment of ['#token=short','#token='+'a'.repeat(43)+'%0A']){
    result.changeHash(fragment);assert.equal(result.state.navigations.length,0);assert.equal(result.location.hash,'');
  }
  const fragment='#token='+'b'.repeat(43);result.changeHash(fragment);
  assert.deepEqual(result.state.navigations,['/reset-password?lang=uk'+fragment]);
  assert.equal(result.location.hash,fragment,'the fresh GET form must receive and scrub the same fragment');
  result.location.pathname='/reset-password';result.changeHash(fragment);
  assert.equal(result.state.navigations[1],'/reset-password/?lang=uk'+fragment);
});

test('native password confirmation blocks a typo without losing the fragment capability',()=>{
  const secret='z'.repeat(43),result=tokenHarness('#token='+secret);
  result.next.value='new-synthetic-password';result.confirm.value='different-synthetic-password';
  result.state.confirmInput();
  assert.equal(result.state.validation,accountWords('uk').passwordMismatch);
  assert.equal(result.field.value,secret,'validation has no token side effect');
  result.confirm.value=result.next.value;result.state.confirmInput();
  assert.equal(result.state.validation,'','matching confirmation clears browser validity');
  result.next.value='changed-synthetic-password';result.state.nextInput();
  assert.equal(result.state.validation,accountWords('uk').passwordMismatch,'editing the original also revalidates');
  result.confirm.value='';result.state.confirmInput();
  assert.equal(result.state.validation,'','native required validation handles an empty confirmation');
  for(const lang of locales){
    const tree=document(accountResetPage({lang}));
    assert.equal(attr(byId(tree,'account-confirm'),'data-mismatch-message'),accountWords(lang).passwordMismatch);
  }
});


test('recovery markup provides mobile wrapping, touch targets, skip link and keyboard focus',()=>{
  const tree=document(accountResetPage({lang:'uk'})),style=text(tags(tree,'style')[0]);
  for(const fragment of ['@media(max-width:480px)','min-height:46px',':focus-visible','overflow-wrap:anywhere','@media(prefers-reduced-motion:reduce)'])assert.ok(style.includes(fragment));
  assert.doesNotMatch(style,/min-width:(?:[3-9]\d\d|\d{4,})px/);
  assert.ok(tags(tree,'a').some(link=>attr(link,'href')==='#account-main'));
  // HTML/VM evidence only; this does not claim a real browser or device layout pass.
});
