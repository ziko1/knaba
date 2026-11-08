import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {parse} from 'parse5';
import {accountSettingsPage,accountRecoveryPage,accountTokenPage,accountPasswordPage,accountWords} from './account-settings-ui.mjs';

const locales=['de','en','pl','lt','ru','uk'];
const timestamp=Date.UTC(2026,10,8,9,30)/1000;
const account=Object.freeze({
  id:'synthetic-user',email:'person@example.test',name:'Test Person',phone:'+49 000 00000',
  company:'Test Organisation',address:'Synthetic street 1',locale:'uk',timeZone:'Europe/Berlin',
  version:3,role:'client',status:'approved',emailChangeAllowed:true,emailChangeBlockedReason:null,
  sessions:[{id:'a'.repeat(64),createdAt:timestamp,expiresAt:timestamp+43200,current:true},
    {id:'b'.repeat(64),createdAt:timestamp-900,expiresAt:timestamp+42300,current:false}]
});
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
  test('account pages are complete, localized and semantically labelled: '+lang,()=>{
    const w=accountWords(lang);
    const pages=[
      accountSettingsPage({account,lang,mailEnabled:true,error:w.validation,notice:w.saved}),
      accountPasswordPage({lang,error:w.validation}),
      accountRecoveryPage({lang,mailEnabled:true,error:w.validation}),
      accountTokenPage({kind:'password_reset',lang,error:w.invalidToken}),
      accountTokenPage({kind:'email_change',lang})
    ];
    for(const html of pages){
      const tree=document(html);
      assert.equal(attr(tags(tree,'html')[0],'lang'),lang);
      assert.equal(attr(tags(tree,'meta').find(node=>attr(node,'name')==='robots'),'content'),'noindex,nofollow');
      assert.doesNotMatch(html,/\bundefined\b|\[object Object\]/);
      accessibleFields(tree);
      for(const form of tags(tree,'form')){
        assert.equal(attr(form,'method'),'post');
        assert.match(attr(form,'action'),new RegExp('\\?lang='+lang+'$'));
      }
      for(const input of tags(tree,'input').filter(node=>attr(node,'type')==='password')){
        assert.equal(attr(input,'value'),undefined,'passwords are never echoed');
        assert.equal(attr(input,'maxlength'),'256');
      }
      for(const link of tags(tree,'a'))assert.match(attr(link,'href'),/^(?:\/(?!\/)|#)/,'only local links');
      assert.equal(tags(tree,'script').filter(node=>attr(node,'src')).length,0,'no external scripts');
      assert.equal(tags(tree,'meta').filter(node=>attr(node,'name')==='referrer').length,0,'server owns referrer policy');
    }
    assert.ok(pages[0].includes(w.settingsTitle));
    assert.ok(pages[1].includes(w.passwordTitle));
    assert.ok(pages[2].includes(w.recoverTitle));
  });
}

test('all six dictionaries cover the same complete public contract and are immutable',()=>{
  const expected=Object.keys(accountWords('de')).sort();
  const required=['settingsTitle','validation','conflict','unavailable','protected','oidc','limited','unauthenticated','saved','sessionsRevoked','emailRequested','passwordChanged','invalidToken'];
  for(const lang of locales){
    const w=accountWords(lang);
    assert.deepEqual(Object.keys(w).sort(),expected);
    for(const key of required)assert.ok(typeof w[key]==='string'&&w[key].length>0,lang+'/'+key);
    for(const key of Object.keys(w))if(typeof w[key]==='string')assert.ok(w[key].trim().length>0,lang+'/'+key);
    assert.deepEqual(Object.keys(w.roles).sort(),['admin','bauleiter','client','owner','partner','worker']);
    assert.ok(Object.isFrozen(w)&&Object.isFrozen(w.roles)&&Object.isFrozen(w.statuses));
  }
  assert.equal(accountWords('<script>'),accountWords('de'));
  assert.equal(accountWords('__proto__'),accountWords('de'));
});

test('profile form edits only allowed personal fields and preserves optimistic version',()=>{
  const tree=document(accountSettingsPage({account,lang:'uk',mailEnabled:true}));
  const form=formAt(tree,'/account/settings/');
  assert.deepEqual(namedControls(form),['address','company','locale','name','phone','timeZone','version']);
  assert.equal(attr(tags(form,'input').find(node=>attr(node,'name')==='version'),'value'),'3');
  assert.equal(attr(byId(tree,'account-name'),'value'),account.name);
  assert.equal(attr(byId(tree,'account-name'),'maxlength'),'160');
  assert.equal(attr(byId(tree,'account-phone'),'maxlength'),'40');
  assert.equal(attr(byId(tree,'account-company'),'maxlength'),'160');
  assert.equal(attr(byId(tree,'account-address'),'maxlength'),'500');
  assert.equal(attr(byId(tree,'account-timeZone'),'maxlength'),'100');
  const localeOptions=tags(byId(tree,'account-locale'),'option');
  assert.deepEqual(localeOptions.map(node=>attr(node,'value')),['de','en','pl','lt','ru','uk']);
  assert.equal(attr(localeOptions.find(node=>attr(node,'selected')!==undefined),'value'),'uk');
  assert.equal(attr(byId(tree,'account-current-email'),'value'),account.email);
  assert.equal(attr(byId(tree,'account-current-email'),'readonly'),'');
  assert.equal(attr(byId(tree,'account-current-email'),'name'),undefined,'current address is not a mutation input');
  assert.doesNotMatch(namedControls(tree).join(','),/user_id|userId|role|status|company_id|permissions/);
  const emptyVersion=document(accountSettingsPage({account:{...account,version:0},lang:'en'}));
  assert.equal(attr(tags(formAt(emptyVersion,'/account/settings/'),'input').find(node=>attr(node,'name')==='version'),'value'),'0');
});

test('account settings keep the existing localized F2 link route without exposing a second federation UI',()=>{
  for(const lang of locales){
    const page=accountSettingsPage({account,lang,linkAccounts:true});
    const link=tags(document(page),'a').find(node=>attr(node,'href')==='/account/erp/?lang='+lang);
    assert.ok(link);assert.equal(text(link),accountWords(lang).linkAccounts);
    assert.doesNotMatch(page,/\/account\/erp-link\//);
    assert.doesNotMatch(accountSettingsPage({account,lang,linkAccounts:false}),/\/account\/erp\//);
  }
});

test('email and password changes expose exact POST contracts with no secret defaults',()=>{
  const tree=document(accountSettingsPage({account,lang:'en',mailEnabled:true}));
  assert.deepEqual(namedControls(formAt(tree,'/account/email/')),['current','email']);
  const password=document(accountPasswordPage({lang:'en'}));
  assert.deepEqual(namedControls(formAt(password,'/account/password/')),['confirm','current','new']);
  assert.equal(attr(byId(password,'account-current'),'autocomplete'),'current-password');
  for(const id of ['account-new','account-confirm']){
    assert.equal(attr(byId(password,id),'autocomplete'),'new-password');
    assert.equal(attr(byId(password,id),'minlength'),'8');
    assert.equal(attr(byId(password,id),'required'),'');
  }
  assert.ok(tags(tree,'a').some(node=>attr(node,'href')==='/account/password/?lang=en'));
  assert.ok(tags(tree,'a').some(node=>attr(node,'href')==='/forgot-password/?lang=en'));
});

test('protected and OIDC addresses cannot be offered a self-service email form',()=>{
  for(const lang of locales){
    const w=accountWords(lang);
    for(const reason of ['protected','oidc']){
      const tree=document(accountSettingsPage({account:{...account,emailChangeAllowed:false,emailChangeBlockedReason:reason},lang,mailEnabled:true}));
      assert.equal(formAt(tree,'/account/email/'),undefined);
      assert.ok(text(tree).includes(w[reason]));
      assert.ok(formAt(tree,'/account/settings/'),'ordinary profile editing remains available');
    }
    const unavailable=document(accountSettingsPage({account,lang,mailEnabled:false}));
    assert.equal(formAt(unavailable,'/account/email/'),undefined);
    assert.ok(text(unavailable).includes(w.emailUnavailable));
  }
});

test('recovery states are uniform and never announce delivery with email disabled',()=>{
  for(const lang of locales){
    const w=accountWords(lang);
    const enabled=document(accountRecoveryPage({lang,mailEnabled:true}));
    assert.deepEqual(namedControls(formAt(enabled,'/forgot-password/')),['email']);
    const known=accountRecoveryPage({lang,mailEnabled:true,sent:true,email:'known@example.test'});
    const unknown=accountRecoveryPage({lang,mailEnabled:true,sent:true,email:'unknown@example.test'});
    assert.equal(known,unknown,'rendering must not disclose recovery eligibility');
    assert.ok(text(document(known)).includes(w.recoverySent));
    assert.doesNotMatch(known,/known@example|unknown@example/);
    for(const sent of [true,false]){
      const disabled=document(accountRecoveryPage({lang,mailEnabled:false,sent}));
      assert.equal(tags(disabled,'form').length,0);
      assert.ok(text(disabled).includes(w.recoveryUnavailable));
      assert.ok(!text(disabled).includes(w.recoverySent));
      assert.ok(tags(disabled,'a').some(node=>attr(node,'href')===(lang==='de'?'':'/'+lang)+'/kontakt/'));
    }
  }
});

test('settings render user data as escaped text, not HTML or authority',()=>{
  const payload='"><img src=x onerror=alert(1)><script>attack()</script>&\'';
  const html=accountSettingsPage({
    account:{...account,name:payload,email:payload,phone:payload,company:payload,address:payload,
      timeZone:payload,role:'__proto__',status:'constructor',
      sessions:[{...account.sessions[0],id:payload}],
      password:'DO-NOT-RENDER-PASSWORD',password_hash:'DO-NOT-RENDER-HASH',token:'DO-NOT-RENDER-TOKEN',salt:'DO-NOT-RENDER-SALT'},
    lang:payload,mailEnabled:true,error:payload,notice:payload
  });
  const tree=document(html);
  assert.equal(attr(tags(tree,'html')[0],'lang'),'de');
  assert.equal(tags(tree,'img').length,0);
  assert.equal(tags(tree,'script').length,1,'only the static error-focus enhancement is allowed');
  assert.equal(attr(byId(tree,'account-name'),'value'),payload);
  assert.equal(attr(byId(tree,'account-current-email'),'value'),payload);
  assert.equal(text(byId(tree,'account-error')),payload);
  assert.equal(text(byId(tree,'account-notice')),payload);
  assert.doesNotMatch(html,/DO-NOT-RENDER|\[object Object\]|function Object/);
  assert.doesNotMatch(html,/<img|<script>attack/);
  assert.equal(attr(byId(tree,'account-timeZone'),'value'),'Europe/Berlin');
  assert.equal(nodes(tree,node=>node.attrs?.some(item=>/^on/.test(item.name))).length,0,'user input cannot add event handlers');
});

test('session UI uses scoped opaque handles, local time and explicit revocation scope',()=>{
  const tree=document(accountSettingsPage({account,lang:'en'}));
  const section=byId(tree,'sessions');
  const forms=tags(section,'form');
  assert.equal(forms.length,4);
  for(const form of forms)assert.deepEqual(namedControls(form),['target']);
  assert.deepEqual(forms.map(form=>attr(tags(form,'input')[0],'value')),['a'.repeat(64),'b'.repeat(64),'others','all']);
  assert.ok(text(section).includes(accountWords('en').sessionCurrent));
  assert.ok(text(section).includes('10:30'),'Europe/Berlin time is used in November');
  assert.equal(attr(tags(section,'time')[0],'datetime'),'2026-11-08T09:30:00.000Z');
  const utc=document(accountSettingsPage({account:{...account,timeZone:'UTC'},lang:'en'}));
  assert.ok(text(byId(utc,'sessions')).includes('9:30'),'UTC is one hour earlier; locale may omit a leading zero');
  const noSessions=document(accountSettingsPage({account:{...account,sessions:[]},lang:'en'}));
  assert.ok(text(byId(noSessions,'sessions')).includes(accountWords('en').sessionsEmpty));
  assert.equal(tags(byId(noSessions,'sessions'),'form').length,0);
  const onlyCurrent=document(accountSettingsPage({account:{...account,sessions:[account.sessions[0]]},lang:'en'}));
  assert.ok(!tags(byId(onlyCurrent,'sessions'),'input').some(input=>attr(input,'value')==='others'));
  const limited=document(accountSettingsPage({account:{...account,sessions:[account.sessions[0]],sessionsLimited:true,sessionCount:101},lang:'en'}));
  assert.ok(text(byId(limited,'sessions')).includes('Active sessions shown: 1 of 101'));
  assert.ok(tags(byId(limited,'sessions'),'input').some(input=>attr(input,'value')==='others'),'bulk revocation remains available for sessions outside the shown window');
  const invalidDates=document(accountSettingsPage({account:{...account,sessions:[{...account.sessions[0],createdAt:NaN,expiresAt:Infinity}]},lang:'en'}));
  assert.equal(tags(byId(invalidDates,'sessions'),'time').length,0);
  assert.ok(text(byId(invalidDates,'sessions')).includes('—'));
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
  const source=accountTokenPage({kind:'password_reset',lang:'uk'});
  const script=text(tags(document(source),'script')[0]);
  runInNewContext(script,{
    document:{getElementById:id=>dom[id]??null},
    location:{hash,pathname:'/reset-password/',search:'?lang=uk'},
    history:{replaceState:(...values)=>calls.push(values)},URLSearchParams,
    fetch:()=>{throw Error('Rendering a recovery link must not perform network requests');}
  });
  return {state,field,entry,ready,calls,next,confirm};
}

test('capability pages support manual no-JS POST without echoing a token or target email',()=>{
  for(const [kind,path,fields] of [
    ['password_reset','/reset-password/',['confirm','new','token']],
    ['email_change','/account/email/confirm/',['token']]
  ]){
    const html=accountTokenPage({kind,lang:'uk',token:'DO-NOT-ECHO-CAPABILITY',email:'DO-NOT-ECHO-ADDRESS'});
    const tree=document(html),form=formAt(tree,path),input=byId(tree,'account-token');
    assert.deepEqual(namedControls(form),fields);
    assert.equal(attr(input,'type'),'text','manual token entry is available without JS');
    assert.equal(attr(input,'value'),undefined);
    assert.equal(attr(input,'required'),'');
    assert.equal(attr(input,'minlength'),'43');
    assert.equal(attr(input,'maxlength'),'43');
    assert.equal(attr(input,'autocomplete'),'off');
    assert.equal(attr(byId(tree,'account-token-entry'),'hidden'),undefined);
    assert.ok(tags(form,'button').some(button=>attr(button,'type')==='submit'&&attr(button,'disabled')===undefined));
    assert.doesNotMatch(html,/DO-NOT-ECHO/);
    for(const node of [...tags(tree,'a'),...tags(tree,'form')])assert.doesNotMatch(attr(node,'href')??attr(node,'action'),/[?&#]token=/);
    const done=document(accountTokenPage({kind,lang:'uk',done:true}));
    assert.equal(tags(done,'form').length,0);
    assert.equal(tags(done,'script').length,0);
    assert.ok(byId(done,'account-notice'));
  }
  assert.throws(()=>accountTokenPage({kind:'role_grant'}),TypeError);
});

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
    const tree=document(accountTokenPage({kind:'password_reset',lang}));
    assert.equal(attr(byId(tree,'account-confirm'),'data-mismatch-message'),accountWords(lang).passwordMismatch);
  }
});

test('responsive source has flexible columns, touch targets, keyboard focus and no fixed mobile minimum',()=>{
  const tree=document(accountSettingsPage({account,lang:'uk'}));
  const style=text(tags(tree,'style')[0]);
  assert.match(style,/minmax\(0,1fr\)/);
  assert.match(style,/@media\(max-width:480px\)/);
  assert.match(style,/min-height:46px/);
  assert.match(style,/:focus-visible/);
  assert.match(style,/overflow-wrap:anywhere/);
  assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(style,/min-width:(?:[3-9]\d\d|\d{4,})px/);
  assert.ok(tags(tree,'a').some(link=>attr(link,'href')==='#account-main'));
  assert.deepEqual(tags(byId(tree,'account-main'),'section').map(section=>attr(section,'id')),['profile','security','sessions']);
  // This proves rendered HTML/CSS structure only, not browser/device layout.
});
