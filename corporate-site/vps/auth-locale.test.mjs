import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authLanguage,authWords,accessWords} from './auth-locale.mjs';
import {roleDestination,workspaceLocale} from './role-destination.mjs';

test('all six account-entry languages have full server-rendered labels',()=>{
 for(const locale of ['de','en','pl','lt','ru','uk']){
  assert.equal(authLanguage(locale),locale);assert.equal(workspaceLocale(locale),locale);
  assert.deepEqual(Object.keys(authWords(locale)).sort(),Object.keys(authWords('de')).sort());
  assert.deepEqual(Object.keys(accessWords(locale)).sort(),Object.keys(accessWords('de')).sort());
  assert.ok([...Object.values(authWords(locale)),...Object.values(accessWords(locale))].every(v=>typeof v==='string'&&v.trim().length));
 }
 for(const unsupported of [null,undefined,'fr','PL','__proto__',{},'constructor'])assert.equal(authLanguage(unsupported),'de');
});
test('language choice never grants a management role or changes redirect safety',()=>{
 for(const locale of ['pl','lt']){
  assert.equal(roleDestination('worker','/admin/?view=studio',locale),'/konto/?lang='+locale);
  assert.equal(roleDestination('owner','/admin/?view=studio',locale),'/admin/?lang='+locale+'&view=studio');
  assert.equal(roleDestination('client','https://foreign.example',locale),'/konto/?lang='+locale);
  assert.equal(roleDestination('client','/'+locale+'/kontakt/',locale),'/'+locale+'/kontakt/');
 }
});
