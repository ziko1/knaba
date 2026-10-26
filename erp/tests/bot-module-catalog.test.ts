import {describe,it,expect} from 'vitest';
import {botModuleById,botModulesFor,botModuleLabel,botModuleSiteUrl} from '../packages/integrations/bot-module-catalog.ts';
import {parseRouterCommand} from '../packages/integrations/whatsapp-router-text.ts';
import {ROLE_PERMISSIONS} from '../packages/domain/permissions.ts';

const staff={roles:['EMPLOYEE'],permissions:['shift.manage','shift.read','task.read','inventory.request','chat.read']};
const director={roles:['OWNER'],permissions:['bot.manage','bot.settings.manage','identity.manage','lead.manage',
  'automation.manage','decision.manage','scope.company','report.read','finance.payroll']};
const guest={roles:['GUEST'],permissions:['chat.read','chat.write','lead.create','identity.manage','bot.manage','automation.manage']};

describe('KNABA bot module catalogue / default deny',()=>{
  it('never displays ERP staff or owner sections to an unauthenticated Telegram sender',()=>{
    expect(botModulesFor(director,false).every(row=>row.audience==='PUBLIC')).toBe(true);
    expect(botModulesFor(undefined,false).some(row=>row.id==='services')).toBe(true);
  });
  it('cannot turn external roles into directors via claimed permissions',()=>{
    const found=botModulesFor(guest,true);
    expect(found.map(row=>row.id)).not.toContain('owner_admin');
    expect(found.map(row=>row.id)).not.toContain('automation');
    expect(found.map(row=>row.id)).not.toContain('shifts');
    expect(found.every(row=>row.audience==='PUBLIC')).toBe(true);
  });
  it('staff have only their real authorized commands, not finance or admin',()=>{
    const found=botModulesFor(staff,true).map(row=>row.id);
    expect(found).toContain('shifts');expect(found).toContain('tasks');
    expect(found).not.toContain('payroll');expect(found).not.toContain('crm');
  });
  it('director sees owned sections but never raw executable ERP endpoints',()=>{
    const rows=botModulesFor(director,true);
    expect(rows.some(row=>row.id==='automation'&&row.command==='AUTOMATIONS')).toBe(true);
    expect(botModuleById('owner_admin',director,true)?.path).toBe('/admin/');
    expect(botModuleById('owner_admin',staff,true)).toBeUndefined();
    const source=botModuleById('finance',director,true)!;
    expect(source.status).toBe('SOURCE_ONLY');
    expect(botModuleSiteUrl(source,'https://kneba.vsp.rest/')).toBeUndefined();
    expect(botModuleLabel(source,'UK')).toContain('Бухгалтерія');
  });
  it('constructs only allowlisted HTTPS site routes without external redirects',()=>{
    const row=botModuleById('enquiry',undefined,false)!;
    expect(botModuleSiteUrl(row,'https://kneba.vsp.rest/')).toBe('https://kneba.vsp.rest/kontakt/');
    expect(botModuleSiteUrl(row,'http://insecure.invalid/')).toBeUndefined();
    expect(botModuleSiteUrl(row,'https://user:pass@example.com/')).toBeUndefined();
    expect(botModuleSiteUrl(row,'https://example.com/custom/')).toBeUndefined();
  });
  it('commands cannot be hidden inside prose, and no implicit approval command exists',()=>{
    expect(parseRouterCommand('/modules')).toEqual({command:'MODULES'});
    expect(parseRouterCommand('/automations')).toEqual({command:'AUTOMATIONS'});
    expect(parseRouterCommand('please /automations and approve now')).toBeUndefined();
    expect(parseRouterCommand('/approve')).toBeUndefined();
  });
});

describe('default canonical owner role: create drafts without activating business rules',()=>{
 it('supports owner-only previews with existing role grants; does not grant approval/execution',()=>{
  const owner={roles:['OWNER'],permissions:ROLE_PERMISSIONS.OWNER};
  expect(owner.permissions).toContain('automation.manage');
  expect(owner.permissions).toContain('decision.manage');
  expect(owner.permissions).toContain('scope.company');
  expect(owner.permissions).not.toContain('automation.approve');
  expect(owner.permissions).not.toContain('automation.execute');
  expect(botModuleById('automation',owner,true)).toMatchObject({
    status:'WHATSAPP_COMMAND',command:'AUTOMATIONS'
  });
  for(const role of ['DIRECTOR','BOT_ADMIN']){
    expect(botModuleById('automation',{roles:[role],permissions:ROLE_PERMISSIONS[role]},true))
      .toBeUndefined();
  }
 });
});
