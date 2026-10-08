import {describe,it,expect,vi,afterEach} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {registry} from '../apps/api/registry.ts';
import {CommandForm,commandFormInput,commandReferenceKind,crewAssignmentOwnEmployeeId,documentUploadContext} from '../apps/web/src/CommandForm.tsx';
import type {Entity,Schema} from '../apps/web/src/api.ts';

const schema=(name:string)=>zodToJsonSchema(registry[name]!.schema,{target:'jsonSchema7'}) as Schema;
const row=(kind:string,id:string,data:Record<string,any>):Entity=>({kind,id,data,version:1,createdAt:'2026-10-08T10:00:00.000Z',updatedAt:'2026-10-08T10:00:00.000Z'});
afterEach(()=>vi.unstubAllGlobals());

describe('V4 command form request contracts (actual domain schemas; no browser execution claim)',()=>{
 it('serializes an explicit owner clear and the required unset owner as null',()=>{
  const value=commandFormInput({siteId:'site-a',geoResponsibleUserId:'',onCallUserId:undefined},schema('site.geo_responsible.set'));
  expect(value).toEqual({siteId:'site-a',geoResponsibleUserId:null,onCallUserId:null});
  expect(registry['site.geo_responsible.set']!.schema.parse(value)).toEqual(value);
  expect(commandFormInput({siteId:'site-a'},schema('site.geo_responsible.set'))).toEqual(value);
 });
 it('keeps a deliberate payout reconciliation without employee statement',()=>{
  const value=commandFormInput({payoutId:'pay-a',receiptId:'',outcome:'TRANSFER_EVIDENCE_CONFIRMED',evidenceReference:'verified transfer',reason:'No employee statement yet'},schema('payout.reconcile'));
  expect(value.receiptId).toBeNull();
  expect(registry['payout.reconcile']!.schema.parse(value)).toEqual(value);
 });
 it('preserves required IDs and omits genuinely empty optional fields',()=>{
  const value=commandFormInput({uploadId:'upload-a',employeeId:'employee-a',siteId:'',taskId:undefined,stage:'DOCUMENT',visibility:'CONFIDENTIAL',caption:'',retentionPurpose:'OFFICIAL_PAYSLIP_DOCUMENT'},schema('media.register'));
  expect(value).not.toHaveProperty('siteId');expect(value).not.toHaveProperty('taskId');
  expect(registry['media.register']!.schema.parse(value)).toMatchObject({employeeId:'employee-a',stage:'DOCUMENT',visibility:'CONFIDENTIAL'});
  expect(()=>registry['media.register']!.schema.parse(commandFormInput({...value,uploadId:''},schema('media.register')))).toThrow();
 });
 it('maps finance and duty owner choices while keeping procurement receipts distinct',()=>{
  for(const [field,command,kind]of [['calculationId','payroll.official','payroll_calculation'],['previousReceiptId','payout.ack_amend','payout_receipt'],['receiptId','payout.reconcile','payout_receipt'],['receiptId','procurement.reconcile','goods_receipt'],['documentMediaId','payroll.official','media_asset'],['geoResponsibleUserId','site.geo_responsible.set','user'],['onCallUserId','site.geo_responsible.set','user']] as const)expect(commandReferenceKind(field,command)).toBe(kind);
  expect(commandReferenceKind('requestId','privacy.review')).toBe('privacy_request');
 });
 it('uses canonical crew employee IDs while time, payroll and task assignments retain user IDs',()=>{
  for(const [field,name]of [['employeeIds','dispatch.reserve'],['foremanId','dispatch.assign'],['employeeId','crew_assignment.acknowledge'],['employeeId','crew_assignment.start'],['employeeId','employee.availability']] as const){
   expect(Object.keys((schema(name).properties||{}))).toContain(field);expect(commandReferenceKind(field,name)).toBe('employee');
  }
  for(const [field,name]of [['employeeId','shift.start'],['employeeId','payroll.calculate'],['employeeIds','task.assign'],['assigneeIds','task.create']] as const)expect(commandReferenceKind(field,name)).toBe('user');
 });
 it('prefills own crew responses from the projected alias without borrowing user or peer IDs',()=>{
  const assignment=row('crew_assignment','assignment-a',{employeeId:'canonical-employee-a',userId:'user-a',employeeIds:['peer-id']});
  for(const name of ['crew_assignment.acknowledge','crew_assignment.start']){
   const employeeId=crewAssignmentOwnEmployeeId(name,assignment);expect(employeeId).toBe('canonical-employee-a');
   expect(registry[name]!.schema.parse(commandFormInput({id:assignment.id,employeeId},schema(name)))).toEqual({id:'assignment-a',employeeId:'canonical-employee-a'});
  }
  expect(crewAssignmentOwnEmployeeId('crew_assignment.acknowledge',row('crew_assignment','assignment-a',{userId:'user-a',employeeIds:['peer-id']}))).toBeUndefined();
  expect(crewAssignmentOwnEmployeeId('dispatch.reserve',assignment)).toBeUndefined();
  expect(crewAssignmentOwnEmployeeId('crew_assignment.start',row('user','user-a',{employeeId:'canonical-employee-a'}))).toBeUndefined();
 });
 it('renders actual crew array and foreman schemas with alias choices instead of user canaries',()=>{
  vi.stubGlobal('navigator',{onLine:true});
  const records={employee:[row('employee','canonical-employee-a',{userId:'user-a',name:'Canonical employee'})],user:[row('user','user-a',{name:'WRONG_USER_REFERENCE_CANARY'})]};
  for(const [name,initial,field]of [['dispatch.reserve',{employeeIds:['canonical-employee-a']},'employeeIds'],['dispatch.assign',{foremanId:'canonical-employee-a'},'foremanId'],['employee.availability',{employeeId:'canonical-employee-a'},'employeeId']] as const){
   const markup=renderToStaticMarkup(createElement(CommandForm,{definition:{name,permission:registry[name]!.permission,schema:schema(name)},initial,records,t:key=>key,onSaved:()=>{},onClose:()=>{}}));
   expect(markup).toContain(`id="field-${field}"`);expect(markup).toContain('value="canonical-employee-a" selected=""');expect(markup).not.toContain('WRONG_USER_REFERENCE_CANARY');expect(markup).not.toContain('value="user-a"');
  }
 });
 it('binds uploaded official documents only to the selected authoritative employee source',()=>{
  const records={payroll_calculation:[row('payroll_calculation','cal-a',{employeeId:'employee-a'})],timesheet:[row('timesheet','time-b',{employeeId:'employee-b'})]};
  expect(documentUploadContext('payroll.official',{calculationId:'cal-a',employeeId:'forged'},records)).toEqual({employeeId:'employee-a',retentionPurpose:'OFFICIAL_PAYSLIP_DOCUMENT'});
  expect(documentUploadContext('payroll.import',{timesheetId:'time-b'},records)).toEqual({employeeId:'employee-b',retentionPurpose:'OFFICIAL_PAYSLIP_DOCUMENT'});
  expect(documentUploadContext('payroll.official',{calculationId:'unavailable'},records)).toBeUndefined();
 });
 it('binds site procurement evidence and refuses an invented warehouse employee context',()=>{
  const records={goods_receipt:[row('goods_receipt','receipt-a',{orderId:'order-a'})],purchase_order:[row('purchase_order','order-a',{locationId:'stock-a'})],stock_location:[row('stock_location','stock-a',{siteId:'site-a'})]};
  expect(documentUploadContext('procurement.reconcile',{receiptId:'receipt-a'},records)).toEqual({siteId:'site-a',retentionPurpose:'PROCUREMENT_DOCUMENT'});
  expect(documentUploadContext('procurement.reconcile',{receiptId:'receipt-a'},{...records,stock_location:[row('stock_location','stock-a',{type:'WAREHOUSE'})]})).toBeUndefined();
 });
 it('renders nullable clears without HTML required blocking the valid None selection',()=>{
  vi.stubGlobal('navigator',{onLine:true});
  const markup=renderToStaticMarkup(createElement(CommandForm,{definition:{name:'site.geo_responsible.set',permission:'site.structure.edit',schema:schema('site.geo_responsible.set')},records:{site:[row('site','site-a',{name:'Site A'})],user:[row('user','employee-a',{name:'Employee A'})]},t:key=>key,onSaved:()=>{},onClose:()=>{}}));
  expect(markup).toMatch(/<select id="field-siteId" required=""/);
  expect(markup).toMatch(/<select id="field-geoResponsibleUserId">/);
  expect(markup).toMatch(/<select id="field-onCallUserId">/);
 });
 it('renders PDF upload with only matching confidential payroll document choices',()=>{
  vi.stubGlobal('navigator',{onLine:true});
  const markup=renderToStaticMarkup(createElement(CommandForm,{definition:{name:'payroll.official',permission:'finance.accountant',schema:schema('payroll.official')},initial:{calculationId:'cal-a'},records:{payroll_calculation:[row('payroll_calculation','cal-a',{employeeId:'employee-a'})],media_asset:[row('media_asset','doc-own',{employeeId:'employee-a',stage:'DOCUMENT',visibility:'CONFIDENTIAL',state:'RECEIVED'}),row('media_asset','doc-other',{employeeId:'employee-b',stage:'DOCUMENT',visibility:'CONFIDENTIAL',state:'RECEIVED'}),row('media_asset','doc-public',{employeeId:'employee-a',stage:'DOCUMENT',visibility:'INTERNAL',state:'RECEIVED'})]},t:key=>key,onSaved:()=>{},onClose:()=>{}}));
  expect(markup).toContain('accept="application/pdf"');expect(markup).toContain('documentUploadLimit');expect(markup).toContain('value="doc-own"');expect(markup).not.toContain('doc-other');expect(markup).not.toContain('doc-public');
 });
});
