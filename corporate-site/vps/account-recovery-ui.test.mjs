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
  const done=document(accountResetPage({lang:'uk',done:true}));assert.equal(tags(done,'form').length,0);assert.equal(tags(done,'script').length,0);
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
function tokenHarness(hash){
  const state={focused:false};
  const field={type:'text',value:'',focus:()=>{state.focused=true;}};
  const entry={hidden:false},ready={hidden:true};
  const edit={addEventListener:(name,callback)=>{assert.equal(name,'click');state.edit=callback;}};
  const next={value:'',addEventListener:(name,callback)=>{assert.equal(name,'input');state.nextInput=callback;}};
  const confirm={value:'',dataset:{mismatchMessage:accountWords('uk').passwordMismatch},
    addEventListener:(name,callback)=>{assert.equal(name,'input');state.confirmInput=callback;},
    setCustomValidity:message=>{state.validation=message;}};
  const dom={'account-token':field,'account-token-entry':entry,'account-token-ready':ready,'account-token-edit':edit,'account-new':next,'account-confirm':confirm};
  const calls=[];
  const source=accountResetPage({lang:'uk'});
  const script=text(tags(document(source),'script')[0]);
  runInNewContext(script,{
    document:{getElementById:id=>dom[id]??null},
    location:{hash,pathname:'/reset-password/',search:'?lang=uk'},
    history:{replaceState:(...values)=>calls.push(values)},URLSearchParams,
    fetch:()=>{throw Error('Rendering a recovery link must not perform network requests');}
  });
  return {state,field,entry,ready,calls,next,confirm};
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
