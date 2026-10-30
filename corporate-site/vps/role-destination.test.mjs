import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roleDestination} from './role-destination.mjs';

test('role homes and legacy workspace links stay in one authorized window',()=>{
  assert.equal(roleDestination('owner','/konto/','uk'),'/admin/?lang=uk');
  assert.equal(roleDestination('admin','/crm/','en'),'/admin/?lang=en&view=crm');
  assert.equal(roleDestination('owner','/studio/','de'),'/admin/?lang=de&view=studio');
  assert.equal(roleDestination('owner','/postfach/','ru'),'/admin/?lang=ru&view=messages');
  for(const role of ['client','partner','worker','bauleiter','pending','suspended']){
    assert.equal(roleDestination(role,'','uk'),'/konto/?lang=uk');
    assert.equal(roleDestination(role,'/admin/?view=studio','uk'),'/konto/?lang=uk');
  }
  assert.equal(roleDestination('admin','/studio/','en'),'/admin/?lang=en');
  assert.equal(roleDestination('admin','/admin/?view=studio&lang=ru'),'/admin/?lang=ru');
  assert.equal(roleDestination('worker','/konto/?lang=uk&tab=messages&conversation=example'),'/konto/?lang=uk&tab=messages&conversation=example');
  assert.equal(roleDestination('client','/kontakt/?anliegen=baureinigung','uk'),'/kontakt/?anliegen=baureinigung');
});

test('untrusted redirects never choose a foreign origin, API, auth loop or higher role',()=>{
  for(const target of ['https://evil.example','//evil.example','/\\evil.example','/%2f%2fevil.example','/api/portal/dashboard','/login/','/logout/','/invite-user/','/admin/\r\nX-Bad: 1','/'+ 'a'.repeat(600)]){
    assert.equal(roleDestination('client',target,'uk'),'/konto/?lang=uk',target);
  }
  assert.equal(roleDestination('worker','/konto/?lang=bogus'),'/konto/?lang=de');
});
