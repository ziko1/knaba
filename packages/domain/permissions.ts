import {Actor,DomainError,Entity} from './core.ts';
export const ROLE_PERMISSIONS:Record<string,string[]>={
 OWNER:['company.manage','identity.manage','role.manage','legal.manage','bot.manage','bot.settings.manage','audit.read','site.read','site.create','site.structure.edit','task.read','task.create','task.assign','task.review','operations.read','decisions.read','decision.manage','integration.status'],
 DIRECTOR:['site.read','site.create','site.structure.edit','order.manage','lead.manage','lead.read','quote.create','quote.approve','quote.issue','quote.accept','quote.read','price.manage','service.manage','dispatch.manage','crew.assign','decision.manage','decisions.read','task.read','task.create','task.assign','task.review','timesheet.read','timesheet.approve','operations.read','report.create','report.review','report.publish','report.read','chat.read','chat.write','chat.manage','translation.use','bot.manage','bot.settings.manage','notifications.manage','customer.manage'],
 OPERATIONS_MANAGER:['site.read','site.create','site.structure.edit','order.manage','lead.manage','lead.read','quote.create','quote.read','dispatch.manage','crew.assign','decision.manage','decisions.read','task.read','task.create','task.assign','task.review','timesheet.read','timesheet.approve','operations.read','report.create','report.review','report.publish','report.read','chat.read','chat.write','chat.manage','translation.use','customer.manage','inventory.request','inventory.read','inventory.approve'],
 DISPATCHER:['site.read','dispatch.manage','crew.assign','task.read','task.assign','operations.read','chat.read','chat.write','translation.use','trip.read','location.presence.read'],
 INTERNAL_BAULEITER:['site.read','site.structure.edit','task.read','task.create','task.assign','task.review','timesheet.read','timesheet.approve','operations.read','report.create','report.read','chat.read','chat.write','chat.manage','translation.use','inventory.request','inventory.read','inventory.approve'],
 TEAM_LEADER:['site.read','task.read','task.assign','task.work','shift.manage','shift.read','trip.manage','trip.read','timesheet.submit','timesheet.read','operations.read','chat.read','chat.write','translation.use','inventory.request','inventory.read','media.upload','media.read','device.self','location.self'],
 EMPLOYEE:['site.read','task.read','task.work','shift.manage','shift.read','trip.manage','trip.read','timesheet.submit','timesheet.read','chat.read','chat.write','translation.use','inventory.request','inventory.read','inventory.use','inventory.receive','media.upload','media.read','payout.acknowledge','payroll.self','device.self','location.self'],
 QUALITY_CONTROL:['site.read','task.read','task.review','quality.manage','report.read','media.read','chat.read','chat.write','translation.use'],
 STOREKEEPER:['inventory.read','inventory.manage','inventory.receive','inventory.issue','inventory.reserve','inventory.adjust','inventory.approve','inventory.request','media.upload','media.read'],
 PROCUREMENT:['inventory.read','procurement.manage','procurement.read','procurement.approve','inventory.receive'],
 ACCOUNTANT:['payroll.manage','payroll.read','payout.approve','payout.record','payout.manage','timesheet.read','report.read','report.export','media.upload','media.read','rate.manage'],
 CLIENT:['customer.portal','quote.accept','quote.read','lead.create','lead.read','lead.manage_own','report.read','report.acknowledge','chat.read','chat.write','translation.use','media.read','issue.create'],
 EXTERNAL_BAULEITER:['customer.portal','quote.read','report.read','report.acknowledge','chat.read','chat.write','translation.use','media.read','issue.create'],
 BOT_ADMIN:['bot.manage','bot.settings.manage','integration.status','notifications.manage','identity.invite','chat.manage','audit.technical'],
 AUDITOR:['audit.read'],DEVELOPER_SUPPORT:['integration.status']
};
export function hasPermission(actor:Actor,p:string){return actor.permissions.includes(p);}
export function enforcePermission(actor:Actor,p:string){if(!hasPermission(actor,p))throw new DomainError('ACCESS_DENIED');}
export const sensitiveKinds=new Set(['user','employee','contact_identity','role_assignment','session','device','tracking_policy','location_sample','geopoint','payroll_calculation','rate_history','official_payslip','payout','payout_allocation','receipt','media_upload','knowledge','assistant_config']);
export function publicEntity(e:Entity):Entity{const data={...e.data};for(const key of ['passwordHash','password_hash','totpSecret','totp_secret','tokenHash','token_hash','codeHash','code_hash','csrf_hash','accessToken','apiKey','secret','privateKey'])delete data[key];return {...e,data};}
// Command permissions are canonical; roles receive no implicit wildcard or finance/GPS bypass.
const add=(role:string,rights:string[])=>ROLE_PERMISSIONS[role]=[...new Set([...(ROLE_PERMISSIONS[role]??[]),...rights])];
add('OWNER',['scope.company']);
add('DIRECTOR',['commerce.manage','commerce.read','commerce.approve','lead.create','lead.manage','lead.handoff','quote.create','quote.approve','quote.send','quote.manage','dispatch.manage','dispatch.read','customer.read','assistant.manage','assistant.approve','automation.manage','automation.approve','report.approve','report.deliver','trip.approve','media.read','media.upload','inventory.approve','inventory.read']);
add('OPERATIONS_MANAGER',['commerce.manage','commerce.read','lead.manage','lead.handoff','quote.create','dispatch.manage','dispatch.read','customer.read','report.approve','report.deliver','trip.approve','media.read','media.upload']);
add('DISPATCHER',['dispatch.read','dispatch.acknowledge']);
add('INTERNAL_BAULEITER',['report.approve','trip.approve','media.read','media.upload']);
add('TEAM_LEADER',['dispatch.acknowledge','inventory.use','inventory.receive','finance.payout.ack']);
add('EMPLOYEE',['dispatch.acknowledge','finance.payout.ack']);
add('QUALITY_CONTROL',['report.review','media.read']);
add('STOREKEEPER',['inventory.ship','inventory.count','inventory.count.approve','inventory.writeoff','inventory.writeoff.approve']);
add('PROCUREMENT',['procurement.request','procurement.order']);
add('ACCOUNTANT',['finance.payroll','finance.accountant','finance.payout','finance.payout.approve','finance.payroll.approve']);
add('CLIENT',['commerce.read','customer.read','report.ack','lead.create']);
add('EXTERNAL_BAULEITER',['commerce.read','customer.read','report.ack']);
add('BOT_ADMIN',['assistant.manage','assistant.approve','automation.manage','automation.approve','device.manage']);
for(const role of Object.keys(ROLE_PERMISSIONS))if(!['GUEST','SERVICE_ACCOUNT'].includes(role))add(role,['identity.self']);
ROLE_PERMISSIONS.GUEST=['lead.create','lead.manage','commerce.read','chat.read','chat.write','translation.use'];
ROLE_PERMISSIONS.SERVICE_ACCOUNT=['integration.process','automation.execute','chat.write','chat.read','translation.use','notifications.manage'];

for(const role of ['OWNER','DIRECTOR','OPERATIONS_MANAGER','INTERNAL_BAULEITER','TEAM_LEADER','EMPLOYEE','QUALITY_CONTROL','STOREKEEPER','PROCUREMENT','BOT_ADMIN'])add(role,['assistant.read']);

for(const role of ['CLIENT','EXTERNAL_BAULEITER'])add(role,['issue.create','issue.read','media.upload']);
for(const role of ['OWNER','DIRECTOR','OPERATIONS_MANAGER','INTERNAL_BAULEITER','QUALITY_CONTROL'])add(role,['issue.read']);

// GPS authority is an explicit recorded grant; no role activates tracking automatically.
export const EXPLICIT_PRIVILEGED_PERMISSIONS=new Set(['location.policy.manage','location.history.read']);

// Privacy review is explicit governance authority; self access is identity.self.
add('OWNER',['privacy.review','privacy.manage']);
