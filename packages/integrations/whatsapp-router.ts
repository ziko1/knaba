import {createHash,randomBytes} from 'node:crypto';
import {assert,DomainError,type Actor,type CommandRegistry,type Data,type Entity,type Transaction} from '../domain/core.ts';
import {exactBaseQuantity} from '../domain/resources.ts';
import {whatsAppPolicy} from '../domain/communications.ts';
import {renderWhatsAppMessage,type WhatsAppInbound,type WhatsAppOutput} from './whatsapp.ts';
import type {SupportedLanguage} from './deepseek.ts';
import {languageLabel,originalMessageLanguage,parseRouterCommand,routerLanguages,routerText} from './whatsapp-router-text.ts';

export interface RouterPrecondition {kind:string;id:string;version:number;}
export interface RouterPersistence<Tx extends Transaction=Transaction> {transaction<T>(companyId:string,actorId:string,operation:(tx:Tx)=>Promise<T>):Promise<T>;}
export interface RouterEngine<Tx extends Transaction=Transaction> {
  registry:CommandRegistry;
  actorIn(tx:Tx,userId:string):Promise<Actor>;
  getActor(userId:string,companyId:string):Promise<Actor>;
  visible(tx:Tx,actor:Actor,entity:Entity):Promise<boolean>;
  execute(actor:Actor,name:string,envelope:{input?:Data;expected_version?:number;idempotency_key?:string;preconditions?:RouterPrecondition[]}):Promise<any>;
}
export interface RouterOptions {
  publicOrigin?:string;
  systemActorId?:string;
  mode:'DEMO'|'TEST'|'PRODUCTION';
  testRecipients?:string[];
  capabilities?:{accountVerified:boolean;buttons:boolean;lists:boolean};
  now?:()=>Date;
  actionTtlSeconds?:number;
}
export interface RouterResult {handled:boolean;state?:string;responseId?:string;command?:string;error?:string;}
interface Choice {label:string;intent:string;payload?:Data;guards?:RouterPrecondition[];permission?:string;}
interface Flow {step:string;data:Data;}
interface CommandPlan {name:string;input:Data;expectedVersion?:number;guards:RouterPrecondition[];presentation?:string;}
interface RouteContext<Tx extends Transaction> {tx:Tx;actor:Actor;source:Entity;session:Entity;input:Extract<WhatsAppInbound,{kind:'MESSAGE'}>;language:SupportedLanguage;now:string;accessRefs:RouterPrecondition[];requiredPermissions:Set<string>;}
type RouteStep=RouterResult|{handled:true;execute:Entity};
const digest=(...values:string[])=>createHash('sha256').update(values.join('\u0000')).digest('hex');
const ref=(e:Entity):RouterPrecondition=>({kind:e.kind,id:e.id,version:e.version});
const external=(a:Actor)=>a.roles.some(r=>['GUEST','CLIENT','CUSTOMER','EXTERNAL_BAULEITER'].includes(r));
const short=(text:string,max:number)=>Array.from(text).slice(0,max).join('');
const label=(e:Entity)=>`${e.data.code??e.data.sku??e.data.name??e.data.title??e.id}`;
const phone=(value:unknown)=>String(value??'').replace(/[^\d]/g,'');
export const isWhatsAppRouterAction=(value:string)=>/^knb1\.[A-Za-z0-9_-]{32}$/.test(value);
export function parseReceiptCents(value:string) {const match=/^(\d{1,12})(?:[.,](\d{1,2}))?$/.exec(value.trim());assert(match,'VALIDATION_ERROR');const result=BigInt(match[1]!)*100n+BigInt((match[2]??'').padEnd(2,'0')||'0');assert(result<=BigInt(Number.MAX_SAFE_INTEGER),'VALIDATION_ERROR');return Number(result);}

/** Durable manual router. It never calls AI, sends externally, authorizes as the worker, or activates GPS. */
export class WhatsAppRouter<Tx extends Transaction> {
  private now:()=>Date;
  constructor(private db:RouterPersistence<Tx>,private engine:RouterEngine<Tx>,private options:RouterOptions) {
    this.now=options.now??(()=>new Date());assert(!options.actionTtlSeconds||options.actionTtlSeconds>=30&&options.actionTtlSeconds<=900,'VALIDATION_ERROR');
    if(options.publicOrigin){const url=new URL(options.publicOrigin);assert((url.protocol==='https:'||this.options.mode!=='PRODUCTION'&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))&&!url.username&&!url.password&&!url.search&&!url.hash&&['','/'].includes(url.pathname),'MISSING_CONFIGURATION');}
  }
  async route(companyId:string,conversationInputId:string):Promise<RouterResult> {
    let step:RouteStep;
    try{step=await this.db.transaction(companyId,this.options.systemActorId??'knaba-integration-service',async tx=>{
      const source=await tx.get('conversation_input',conversationInputId);assert(source.companyId===companyId&&source.data.provider==='WHATSAPP','NOT_FOUND_SAFE');
      if(source.data.router_handled)return {handled:true,state:source.data.router_state,responseId:source.data.router_response_id,command:source.data.router_command,error:source.data.router_error};
      if(source.data.status!=='PENDING')return {handled:false};
      const input=source.data.input as WhatsAppInbound;assert(input.kind==='MESSAGE'&&input.id===source.data.provider_event_id,'VALIDATION_ERROR');
      const actor=await this.engine.actorIn(tx,source.data.user_id);await this.identity(tx,actor,input.sender);
      const sessionId=digest('whatsapp-router',companyId,actor.userId,input.sender);
      let session=(await tx.list('whatsapp_router_session')).find(s=>s.id===sessionId);
      const settings=(await tx.list('notification_setting')).find(s=>s.data.user_id===actor.userId);
      const command=parseRouterCommand(input.text??'');
      const selected=settings?.data.language;
      const language=(routerLanguages.includes(selected)?selected:command?.language??source.data.language??'DE') as SupportedLanguage;
      if(!session)session=await tx.add('whatsapp_router_session',{user_id:actor.userId,sender:input.sender,generation:0,flow:null,suspended_flow:null,language},sessionId);
      const ctx:RouteContext<Tx>={tx,actor,source,session,input,language:routerLanguages.includes(language)?language:'DE',now:this.now().toISOString(),accessRefs:[],requiredPermissions:new Set()};
      const resumed=source.data.router_action_id?await tx.get('whatsapp_router_action',source.data.router_action_id):undefined;
      if(resumed?.data.status==='CLAIMED'&&resumed.data.claimed_input_id===source.id)return {handled:true,execute:resumed};
      if(input.action_id){if(!isWhatsAppRouterAction(input.action_id))return {handled:false};const action=(await tx.list('whatsapp_router_action')).find(a=>a.data.action_hash===digest(input.action_id!));return this.action(ctx,action);}
      // Within a named chat ordinary START/END is original message text, never an accidental work action.
      if(session.data.flow?.step==='CHAT_COMPOSE'&&input.text&&!input.text.trim().startsWith('/'))return this.flowInput(ctx,session.data.flow,input.text);
      if(command)return this.navigate(ctx,command.command);
      if(source.data.upload_id)return this.media(ctx,source.data.upload_id);
      if(input.media)return this.respond(ctx,this.text(ctx,'manualMedia')+(this.web()?`\n${this.web()}`:''),[{label:'MENU',intent:'MAIN'}],'MEDIA_MANUAL');
      if(session.data.flow&&input.text)return this.flowInput(ctx,session.data.flow,input.text);
      if(input.text&&/^\d{1,2}$/.test(input.text.trim())){const index=Number(input.text.trim())-1;const actionId=session.data.text_choices?.[index];if(actionId)return this.action(ctx,await tx.get('whatsapp_router_action',actionId));}
      return {handled:false};
    });}catch(error){if(error instanceof DomainError&&['ACCESS_DENIED','NOT_FOUND_SAFE','AMBIGUOUS_RECIPIENT'].includes(error.code))throw error;return this.fail(companyId,conversationInputId,error);}
    if('execute' in step)return this.execute(companyId,conversationInputId,step.execute);
    return step;
  }
  private async identity(tx:Tx,actor:Actor,sender:string) {
    const identities=(await tx.list('contact_identity')).filter(i=>i.companyId===actor.companyId&&i.data.active!==false&&i.data.verified===true&&!i.data.revokedAt&&!i.data.revoked_at&&(!i.data.expiresAt||Date.parse(i.data.expiresAt)>this.now().getTime())&&(!i.data.expires_at||Date.parse(i.data.expires_at)>this.now().getTime())&&['WHATSAPP','PHONE'].includes(i.data.type)&&phone(i.data.value)===sender);
    assert(identities.length>0&&new Set(identities.map(i=>i.data.userId)).size===1&&identities.every(i=>i.data.userId===actor.userId),'ACCESS_DENIED');
  }
  private allowed(ctx:RouteContext<Tx>,permission:string){return !external(ctx.actor)&&ctx.actor.permissions.includes(permission);}
  private require(ctx:RouteContext<Tx>,permission:string){assert(this.allowed(ctx,permission),'ACCESS_DENIED');ctx.requiredPermissions.add(permission);}
  private async visible(ctx:RouteContext<Tx>,kind:string,predicate:(e:Entity)=>boolean=()=>true){const rows:Entity[]=[];for(const e of await ctx.tx.list(kind))if(predicate(e)&&await this.engine.visible(ctx.tx,ctx.actor,e))rows.push(e);return rows;}
  private async activeShift(ctx:RouteContext<Tx>){this.require(ctx,'shift.manage');const shifts=await this.visible(ctx,'shift',s=>s.data.employeeId===ctx.actor.userId&&s.data.state==='ACTIVE');assert(shifts.length<=1,'INVALID_STATE');return shifts[0];}
  private async activeTrip(ctx:RouteContext<Tx>,shift:Entity){return (await this.visible(ctx,'trip',t=>t.data.employeeId===ctx.actor.userId&&t.data.shiftId===shift.id&&t.data.state==='IN_PROGRESS'))[0];}
  private web(path='/app'){return this.options.publicOrigin?`${this.options.publicOrigin.replace(/\/$/,'')}${path}`:undefined;}
  private text(ctx:RouteContext<Tx>,key:string){return routerText(ctx.language,key);}
  private async setFlow(ctx:RouteContext<Tx>,flow:Flow|null,suspended?:Flow|null){ctx.session=await ctx.tx.save(ctx.session,{...ctx.session.data,flow,...suspended!==undefined?{suspended_flow:suspended}:{}});}
  private async respond(ctx:RouteContext<Tx>,body:string,choices:Choice[]=[],state='MENU'):Promise<RouterResult> {
    assert(body.length>0&&body.length<=4096&&choices.length<=10,'VALIDATION_ERROR');
    const generation=ctx.session.data.generation+1,expiresAt=new Date(Date.parse(ctx.now)+(this.options.actionTtlSeconds??300)*1000).toISOString();
    const options:{token:string;action:Entity;choice:Choice}[]=[];
    for(const choice of choices){const token=`knb1.${randomBytes(24).toString('base64url')}`;
      const action=await ctx.tx.add('whatsapp_router_action',{action_hash:digest(token),session_id:ctx.session.id,session_generation:generation,user_id:ctx.actor.userId,sender:ctx.input.sender,intent:choice.intent,payload:choice.payload??{},guards:choice.guards??[],permission:choice.permission,status:'PENDING',expires_at:expiresAt});options.push({token,action,choice});
      for(const guard of choice.guards??[])ctx.accessRefs.push(guard);if(choice.permission)ctx.requiredPermissions.add(choice.permission);
    }
    ctx.session=await ctx.tx.save(ctx.session,{...ctx.session.data,generation,language:ctx.language,screen:state,text_choices:options.map(o=>o.action.id),updated_at:ctx.now});
    const caps=this.options.capabilities;const interactive=caps?.accountVerified===true&&body.length<=1024;
    let output:WhatsAppOutput;
    if(interactive&&caps.buttons&&options.length>0&&options.length<=3)output={kind:'BUTTONS',text:body,buttons:options.map(o=>({id:o.token,title:short(o.choice.label,20)}))};
    else if(interactive&&caps.lists&&options.length>0)output={kind:'LIST',text:body,button:short(this.text(ctx,'select'),20),sections:[{title:'KNABA DE',rows:options.map(o=>({id:o.token,title:short(o.choice.label,24)}))}]};
    else{const text=body+(options.length?'\n'+options.map((o,i)=>`${i+1}) ${short(o.choice.label,100)}`).join('\n'):'');assert(text.length<=4096,'VALIDATION_ERROR');output={kind:'TEXT',text};}
    renderWhatsAppMessage(ctx.input.sender,output);
    const response=await ctx.tx.add('whatsapp_router_response',{user_id:ctx.actor.userId,recipient_id:ctx.actor.userId,sender:ctx.input.sender,input_id:ctx.source.id,session_id:ctx.session.id,session_generation:generation,language:ctx.language,output,access_refs:[...new Map(ctx.accessRefs.map(g=>[`${g.kind}:${g.id}`,g])).values()],required_permissions:[...ctx.requiredPermissions],internal:!external(ctx.actor),status:'PENDING',expires_at:expiresAt});
    await ctx.tx.event('whatsapp.router_response',{response_id:response.id});
    await ctx.tx.save(ctx.source,{...ctx.source.data,status:'PROCESSED',router_handled:true,router_state:state,router_response_id:response.id,completed_at:ctx.now});
    return {handled:true,state,responseId:response.id};
  }
  private async page(ctx:RouteContext<Tx>,body:string,choices:Choice[],intent:string,payload:Data={},offset=0,state=intent):Promise<RouterResult> {
    assert(Number.isInteger(offset)&&offset>=0,'VALIDATION_ERROR');const selected=choices.slice(offset,offset+8);
    if(offset>0)selected.push({label:this.text(ctx,'back'),intent,payload:{...payload,offset:Math.max(0,offset-8)}});
    if(choices.length>offset+8)selected.push({label:this.text(ctx,'more'),intent,payload:{...payload,offset:offset+8}});
    else if(selected.length<10)selected.push({label:'MENU',intent:'MAIN'});
    return this.respond(ctx,selected.length===1?this.text(ctx,'empty'):body,selected,state);
  }
  private async main(ctx:RouteContext<Tx>,offset=0){
    const items:[string,string,string][]=[['shift','SHIFT','shift.manage'],['travel','TRAVEL','trip.manage'],['materials','MATERIALS','inventory.request'],['tasks','TASKS','task.read'],['hours','HOURS','shift.read'],['payroll','PAYROLL','finance.payout.ack'],['chats','CHATS','chat.read'],['gps','GPS','device.self']];
    const choices:Choice[]=items.filter(([, ,p])=>this.allowed(ctx,p)).map(([name,intent,permission])=>({label:this.text(ctx,name),intent,permission}));
    if(ctx.actor.permissions.some(p=>['bot.manage','bot.settings.manage','integration.status','identity.manage','decision.manage'].includes(p))&&!external(ctx.actor))choices.push({label:this.text(ctx,'admin'),intent:'ADMIN'});
    if(ctx.session.data.suspended_flow)choices.push({label:this.text(ctx,'continue'),intent:'CONTINUE'});
    choices.push({label:this.text(ctx,'language'),intent:'LANGUAGE'},{label:this.text(ctx,'help'),intent:'HELP'});return this.page(ctx,this.text(ctx,'main'),choices,'MAIN',{},offset,'MAIN');
  }
  private async navigate(ctx:RouteContext<Tx>,command:string):Promise<RouteStep> {
    if(command==='MENU'){if(ctx.session.data.flow)await this.setFlow(ctx,null,ctx.session.data.flow);return this.main(ctx);}
    if(command==='CANCEL'){await this.setFlow(ctx,null,null);return this.main(ctx);}
    if(command==='BACK'){if(ctx.session.data.flow)await this.setFlow(ctx,null,ctx.session.data.flow);return this.main(ctx);}
    if(command==='CONTINUE'){const flow=ctx.session.data.suspended_flow;assert(flow,'INVALID_STATE');await this.setFlow(ctx,flow,null);return this.flowPrompt(ctx,flow);}
    if(command==='LANGUAGE')return this.respond(ctx,this.text(ctx,'language'),routerLanguages.map(code=>({label:languageLabel[code],intent:'SET_LANGUAGE',payload:{language:code}})),'LANGUAGE');
    if(command==='HELP')return this.respond(ctx,`${this.text(ctx,'helpNotice')}${this.web()?`\n${this.web()}`:''}`,[{label:'MENU',intent:'MAIN'}],'HELP');
    if(command==='GPS'){this.require(ctx,'device.self');const devices=await this.visible(ctx,'device',d=>d.data.employeeId===ctx.actor.userId&&d.data.active);ctx.accessRefs.push(...devices.map(ref));return this.respond(ctx,`${this.text(ctx,'gpsNotice')}\n${devices.map(d=>d.id).join('\n')}${this.web('/app')?`\n${this.web('/app')}`:''}`,[{label:'MENU',intent:'MAIN'}],'GPS');}
    if(command==='ADMIN')return this.admin(ctx);
    if(command==='OPTIN'||command==='STOP'){assert(ctx.actor.permissions.includes('chat.read'),'ACCESS_DENIED');const settings=(await ctx.tx.list('notification_setting')).find(s=>s.data.user_id===ctx.actor.userId);return this.immediate(ctx,{name:'notifications.configure',input:{language:ctx.language,whatsapp_consent:command==='OPTIN',opted_out:command==='STOP',quiet_start:settings?.data.quiet_start??22,quiet_end:settings?.data.quiet_end??7,allowed_fallback:settings?.data.allowed_fallback??'WEB'},guards:[],presentation:command});}
    if(command==='START')return this.sitePicker(ctx,'START_SITE');
    if(command==='SHIFT'){const shift=await this.activeShift(ctx);if(!shift)return this.respond(ctx,this.text(ctx,'noShift'),[{label:this.text(ctx,'start'),intent:'START',permission:'shift.manage'},{label:'MENU',intent:'MAIN'}],'SHIFT');ctx.accessRefs.push(ref(shift));const options:Choice[]=[{label:this.text(ctx,shift.data.activity==='ON_BREAK'?'resume':'pause'),intent:shift.data.activity==='ON_BREAK'?'RESUME':'BREAK',permission:'shift.manage'},{label:this.text(ctx,'end'),intent:'END',permission:'shift.manage'},{label:'MENU',intent:'MAIN'}];return this.respond(ctx,`${this.text(ctx,'shift')} · ${shift.id}\n${this.text(ctx,shift.data.activity)}\n${shift.data.siteId}\n${shift.data.startAt}`,options,'SHIFT');}
    if(['BREAK','RESUME','END','HOURS'].includes(command))return this.shiftAction(ctx,command);
    if(command==='TRAVEL')return this.travel(ctx);
    if(command==='MATERIALS')return this.materials(ctx);
    if(command==='PAYROLL')return this.payroll(ctx);
    if(command==='TASKS')return this.tasks(ctx);
    if(command==='CHATS')return this.chats(ctx);
    return {handled:false};
  }
  private async action(ctx:RouteContext<Tx>,action:Entity|undefined):Promise<RouteStep> {
    if(!action||action.data.user_id!==ctx.actor.userId||action.data.sender!==ctx.input.sender||action.data.session_id!==ctx.session.id) return this.respond(ctx,this.text(ctx,'stale'),[{label:'MENU',intent:'MAIN'}],'EXPIRED');
    if(action.data.status==='CLAIMED'&&action.data.claimed_input_id===ctx.source.id)return {handled:true,execute:action};
    if(action.data.status==='CLAIMED')return this.respond(ctx,this.text(ctx,'processing'),[{label:'MENU',intent:'MAIN'}],'COMMAND_PENDING');
    if(action.data.status==='SUCCEEDED'&&action.data.expires_at>ctx.now){if(action.data.permission)assert(this.allowed(ctx,action.data.permission),'ACCESS_DENIED');if(action.data.result_id&&action.data.result_kind){const result=await ctx.tx.get(action.data.result_kind,action.data.result_id);assert(await this.engine.visible(ctx.tx,ctx.actor,result),'ACCESS_DENIED');ctx.accessRefs.push(ref(result));}return this.respond(ctx,this.text(ctx,'already'),[{label:'MENU',intent:'MAIN'}],'ALREADY_PROCESSED');}
    if(action.data.status!=='PENDING'||action.data.expires_at<=ctx.now||action.data.session_generation!==ctx.session.data.generation)return this.respond(ctx,this.text(ctx,'stale'),[{label:'MENU',intent:'MAIN'}],'EXPIRED');
    if(action.data.permission)assert(ctx.actor.permissions.includes(action.data.permission)&&(!external(ctx.actor)||['chat.read','translation.use'].includes(action.data.permission)),'ACCESS_DENIED');
    for(const guard of action.data.guards??[]){const current=await ctx.tx.get(guard.kind,guard.id);assert(current.version===guard.version&&await this.engine.visible(ctx.tx,ctx.actor,current),'VERSION_CONFLICT');ctx.accessRefs.push(guard);}
    if(action.data.intent==='EXECUTE')return this.claim(ctx,action);
    await ctx.tx.save(action,{...action.data,status:'CONSUMED',claimed_input_id:ctx.source.id,consumed_at:ctx.now});
    const p=action.data.payload;
    switch(action.data.intent){
      case 'MAIN':return this.main(ctx,p.offset??0);
      case 'START':case 'SHIFT':case 'BREAK':case 'RESUME':case 'END':case 'TRAVEL':case 'MATERIALS':case 'PAYROLL':case 'TASKS':case 'HOURS':case 'CHATS':case 'GPS':case 'HELP':case 'ADMIN':case 'LANGUAGE':case 'CONTINUE':return this.navigate(ctx,action.data.intent);
      case 'CANCEL':return this.navigate(ctx,'CANCEL');
      case 'SET_LANGUAGE':{assert(routerLanguages.includes(p.language),'VALIDATION_ERROR');ctx.language=p.language;const setting=(await ctx.tx.list('notification_setting')).find(s=>s.data.user_id===ctx.actor.userId);const data={...setting?.data,user_id:ctx.actor.userId,language:p.language,language_source:'EXPLICIT',language_selected_at:ctx.now};if(setting)await ctx.tx.save(setting,data);else await ctx.tx.add('notification_setting',data);return this.main(ctx);}
      case 'SITE_PAGE':return this.sitePicker(ctx,p.next,p.data??{},p.offset??0);
      case 'START_SITE':{this.require(ctx,'shift.manage');const site=await ctx.tx.get('site',p.siteId);return this.preview(ctx,this.text(ctx,'start')+`\n${label(site)} · ${site.id}`,{name:'shift.start',input:{siteId:site.id},guards:[ref(site)]});}
      case 'TRAVEL_DESTINATION':{const shift=await this.activeShift(ctx);assert(shift,'INVALID_STATE');await this.setFlow(ctx,{step:'TRAVEL_PURPOSE',data:{shiftId:shift.id,shiftVersion:shift.version,destination:p.destination,destinationGuard:p.guard}});return this.flowPrompt(ctx,ctx.session.data.flow);}
      case 'TRAVEL_PAGE':return this.travelDestinations(ctx,p.offset??0);
      case 'TRIP_ARRIVE':{const trip=await ctx.tx.get('trip',p.tripId),shift=await ctx.tx.get('shift',trip.data.shiftId);this.require(ctx,'trip.manage');return this.preview(ctx,this.text(ctx,p.startWork?'arriveWork':'arrive')+`\n${trip.data.destination.kind} · ${trip.data.destination.id}`,{name:'trip.arrive',input:{tripId:trip.id,startWork:p.startWork},expectedVersion:trip.version,guards:[ref(trip),ref(shift)]});}
      case 'MATERIAL_NEW':return this.sitePicker(ctx,'MATERIAL_SITE');
      case 'MATERIAL_SITE':return this.materialPicker(ctx,p.siteId);
      case 'MATERIAL_PAGE':return this.materialPicker(ctx,p.siteId,p.offset??0);
      case 'MATERIAL_SELECT':{await this.setFlow(ctx,{step:'MATERIAL_QUANTITY',data:{siteId:p.siteId,materialId:p.materialId,guards:action.data.guards}});return this.flowPrompt(ctx,ctx.session.data.flow);}
      case 'REQUEST_SUBMIT':{const request=await ctx.tx.get('material_request',p.requestId);this.require(ctx,'inventory.request');assert(request.data.employeeId===ctx.actor.userId,'ACCESS_DENIED');return this.preview(ctx,this.text(ctx,'submit')+`\n${request.id}\n${request.data.quantityBase} ${p.unit??''}`,{name:'request.submit',input:{requestId:request.id},expectedVersion:request.version,guards:[ref(request)]});}
      case 'PAYOUT_SELECT':return this.payout(ctx,p.payoutId);
      case 'PAYOUT_DECISION':{const payout=await ctx.tx.get('payout',p.payoutId);this.require(ctx,'finance.payout.ack');assert(payout.data.employeeId===ctx.actor.userId,'ACCESS_DENIED');const step=p.decision==='PARTIAL'?'PAYOUT_AMOUNT':'PAYOUT_STATEMENT';await this.setFlow(ctx,{step,data:{payoutId:payout.id,payoutVersion:payout.version,decision:p.decision,amountCents:payout.data.amountCents,method:payout.data.method}});return this.flowPrompt(ctx,ctx.session.data.flow);}
      case 'PAYROLL_PAGE':return this.payroll(ctx,p.offset??0);
      case 'TASK_PAGE':return this.tasks(ctx,p.offset??0);
      case 'TASK_SELECT':return this.task(ctx,p.taskId);
      case 'TASK_START':{const task=await ctx.tx.get('task',p.taskId);this.require(ctx,'task.work');return this.preview(ctx,this.text(ctx,'taskStart')+`\n${task.data.title} · ${task.id}`,{name:'task.start',input:{taskId:task.id},expectedVersion:task.version,guards:[ref(task)]});}
      case 'TASK_SUBMIT':{const task=await ctx.tx.get('task',p.taskId);this.require(ctx,'task.work');await this.setFlow(ctx,{step:'TASK_DESCRIPTION',data:{taskId:task.id,taskVersion:task.version}});return this.flowPrompt(ctx,ctx.session.data.flow);}
      case 'CHAT_PAGE':return this.chats(ctx,p.offset??0);
      case 'CHAT_SELECT':{const channel=await ctx.tx.get('channel',p.channelId);this.require(ctx,'chat.write');assert(await this.engine.visible(ctx.tx,ctx.actor,channel),'ACCESS_DENIED');await this.setFlow(ctx,{step:'CHAT_COMPOSE',data:{channelId:channel.id,channelVersion:channel.version,name:channel.data.name}});return this.flowPrompt(ctx,ctx.session.data.flow);}
      case 'MEDIA_SITE':return this.mediaTasks(ctx,{...p},0);
      case 'MEDIA_TASK_PAGE':return this.mediaTasks(ctx,p,p.offset??0);
      case 'MEDIA_TASK':return this.mediaStages(ctx,p);
      case 'MEDIA_STAGE':{this.require(ctx,'media.upload');const upload=await ctx.tx.get('media_upload',p.uploadId),site=await ctx.tx.get('site',p.siteId);const guards=[ref(upload),ref(site)];if(p.taskId)guards.push(ref(await ctx.tx.get('task',p.taskId)));return this.preview(ctx,`${this.text(ctx,'stage')}: ${this.text(ctx,p.stage)}\n${label(site)} · ${site.id}${p.taskId?`\n${p.taskId}`:''}\n${p.caption??''}\n${this.text(ctx,'internal')}`,{name:'media.register',input:{uploadId:p.uploadId,siteId:p.siteId,...p.taskId?{taskId:p.taskId}:{},stage:p.stage,visibility:'INTERNAL',caption:p.caption??'',retentionPurpose:'WORK_EVIDENCE_CONTEXT_CONFIRMED_BY_UPLOADER'},guards,presentation:'MEDIA'});}
      default:return this.respond(ctx,this.text(ctx,'error'),[{label:'MENU',intent:'MAIN'}],'UNSUPPORTED');
    }
  }
  private async preview(ctx:RouteContext<Tx>,body:string,plan:CommandPlan){const def=this.engine.registry[plan.name];assert(def,'NOT_FOUND_SAFE');this.require(ctx,def.permission);def.schema.parse(plan.input);await this.setFlow(ctx,null,null);return this.respond(ctx,`${this.text(ctx,'preview')}\n${body}`,[{label:this.text(ctx,'confirm'),intent:'EXECUTE',payload:{plan},guards:plan.guards,permission:def.permission},{label:this.text(ctx,'cancel'),intent:'CANCEL'},{label:'MENU',intent:'MAIN'}],'PREVIEW');}
  private async immediate(ctx:RouteContext<Tx>,plan:CommandPlan):Promise<RouteStep>{const def=this.engine.registry[plan.name];assert(def&&ctx.actor.permissions.includes(def.permission),'ACCESS_DENIED');const action=await ctx.tx.add('whatsapp_router_action',{session_id:ctx.session.id,session_generation:ctx.session.data.generation,user_id:ctx.actor.userId,sender:ctx.input.sender,intent:'EXECUTE',payload:{plan},guards:plan.guards,status:'PENDING',expires_at:new Date(Date.parse(ctx.now)+300000).toISOString()});return this.claim(ctx,action);}
  private async claim(ctx:RouteContext<Tx>,action:Entity):Promise<RouteStep>{const claimed=await ctx.tx.save(action,{...action.data,status:'CLAIMED',claimed_input_id:ctx.source.id,claimed_at:ctx.now});await ctx.tx.save(ctx.source,{...ctx.source.data,router_action_id:action.id,router_state:'COMMAND_PENDING',router_command:action.data.payload.plan?.name});return {handled:true,execute:claimed};}
  private async execute(companyId:string,inputId:string,action:Entity):Promise<RouterResult>{
    const plan=action.data.payload.plan as CommandPlan;assert(plan,'VALIDATION_ERROR');
    const actor=await this.engine.getActor(action.data.user_id,companyId);
    try{const result=await this.engine.execute(actor,plan.name,{input:plan.input,expected_version:plan.expectedVersion,preconditions:[...plan.guards,ref(action)],idempotency_key:digest('whatsapp-router-command',companyId,action.id)});
      return await this.db.transaction(companyId,this.options.systemActorId??'knaba-integration-service',async tx=>{const ctx=await this.context(tx,inputId);const current=await tx.get('whatsapp_router_action',action.id);assert(current.data.claimed_input_id===inputId,'ACCESS_DENIED');await tx.save(current,{...current.data,status:'SUCCEEDED',result_id:result?.id??null,result_kind:result?.kind??null,completed_at:ctx.now});await this.setFlow(ctx,null,null);ctx.requiredPermissions.add(this.engine.registry[plan.name]!.permission);ctx.accessRefs.push(...plan.guards);if(result?.id&&result.kind&&await this.engine.visible(tx,ctx.actor,result))ctx.accessRefs.push(ref(result));
        if(plan.presentation==='HOURS'){return this.respond(ctx,`${this.text(ctx,'hours')}\n${result.shiftId}\n${this.text(ctx,'WORKING')}: ${result.workSeconds}s\n${this.text(ctx,'TRAVELLING')}: ${result.travelSeconds}s\n${this.text(ctx,'ON_BREAK')}: ${result.breakSeconds}s\n${this.text(ctx,'AWAY_PENDING_REASON')}: ${result.pendingSeconds}s`,[{label:'MENU',intent:'MAIN'}],'HOURS');}
        const notice=plan.presentation==='OPTIN'?this.text(ctx,'optin'):plan.presentation==='STOP'?this.text(ctx,'stopped'):plan.name==='request.create'?this.text(ctx,'draft'):this.text(ctx,'saved');
        const choices:Choice[]=[{label:'MENU',intent:'MAIN'}];if(plan.name==='request.create')choices.unshift({label:this.text(ctx,'submit'),intent:'REQUEST_SUBMIT',payload:{requestId:result.id,unit:plan.input.unit},guards:[ref(result)],permission:'inventory.request'});
        return {...await this.respond(ctx,`${notice}${result?.id?`\n${result.id}`:''}${plan.name.startsWith('shift.')||plan.name.startsWith('trip.')?`\n${this.text(ctx,'noGps')}`:''}`,choices,'COMMAND_SUCCEEDED'),command:plan.name};
      });
    }catch(error){if(!(error instanceof DomainError))throw error;return this.fail(companyId,inputId,error,action.id,plan.name);}
  }
  private async context(tx:Tx,inputId:string):Promise<RouteContext<Tx>>{const source=await tx.get('conversation_input',inputId),input=source.data.input as Extract<WhatsAppInbound,{kind:'MESSAGE'}>;const actor=await this.engine.actorIn(tx,source.data.user_id);await this.identity(tx,actor,input.sender);const session=await tx.get('whatsapp_router_session',digest('whatsapp-router',source.companyId,actor.userId,input.sender));return {tx,actor,source,session,input,language:session.data.language,now:this.now().toISOString(),accessRefs:[],requiredPermissions:new Set()};}
  private async fail(companyId:string,inputId:string,error:unknown,actionId?:string,command?:string):Promise<RouterResult>{return this.db.transaction(companyId,this.options.systemActorId??'knaba-integration-service',async tx=>{const ctx=await this.context(tx,inputId);const code=error instanceof DomainError?error.code:'VALIDATION_ERROR';if(actionId){const action=await tx.get('whatsapp_router_action',actionId);await tx.save(action,{...action.data,status:'FAILED',error:code});}const key=code==='VERSION_CONFLICT'||code==='CALLBACK_EXPIRED'?'stale':code==='NEEDS_REAUTH'?'noReauth':code==='ACCESS_DENIED'?'denied':'error';const suffix=code==='NEEDS_REAUTH'&&this.web()?`\n${this.web()}`:'';const result=await this.respond(ctx,this.text(ctx,key)+suffix,[{label:'MENU',intent:'MAIN'}],'REJECTED');const saved=await tx.get('conversation_input',inputId);await tx.save(saved,{...saved.data,router_error:code,router_command:command});return {...result,error:code,command};});}
  private async sitePicker(ctx:RouteContext<Tx>,next:string,data:Data={},offset=0){this.require(ctx,next==='START_SITE'?'shift.manage':next==='MATERIAL_SITE'?'inventory.request':'media.upload');const sites=await this.visible(ctx,'site',s=>s.data.active!==false&&(ctx.actor.siteIds.includes(s.id)||ctx.actor.permissions.includes('scope.company')));return this.page(ctx,this.text(ctx,next==='MEDIA_SITE'?'mediaSite':'site'),sites.map(s=>({label:label(s),intent:next,payload:{...data,siteId:s.id},guards:[ref(s)],permission:next==='START_SITE'?'shift.manage':next==='MATERIAL_SITE'?'inventory.request':'media.upload'})),'SITE_PAGE',{next,data},offset,next);}
  private async shiftAction(ctx:RouteContext<Tx>,action:string):Promise<RouteStep>{const shift=await this.activeShift(ctx);if(!shift)return this.respond(ctx,this.text(ctx,'noShift'),[{label:'MENU',intent:'MAIN'}],'SHIFT');
    if(action==='HOURS'){this.require(ctx,'shift.read');return this.immediate(ctx,{name:'shift.summary',input:{shiftId:shift.id},guards:[ref(shift)],presentation:'HOURS'});}
    const trip=await this.activeTrip(ctx,shift);let plan:CommandPlan;
    if(action==='END')plan={name:'shift.end',input:{shiftId:shift.id},expectedVersion:shift.version,guards:[ref(shift),...trip?[ref(trip)]:[]]};
    else if(action==='BREAK'&&trip&&shift.data.activity==='TRAVELLING'){this.require(ctx,'trip.manage');plan={name:'trip.stop',input:{tripId:trip.id,kind:'PRIVATE_BREAK',reason:this.text(ctx,'pause')},guards:[ref(shift),ref(trip)]};}
    else if(action==='RESUME'&&trip&&shift.data.activity==='ON_BREAK'){this.require(ctx,'trip.manage');plan={name:'trip.resume',input:{tripId:trip.id},guards:[ref(shift),ref(trip)]};}
    else{assert(action==='BREAK'?shift.data.activity!=='ON_BREAK':shift.data.activity!=='WORKING'&&shift.data.activity!=='TRAVELLING','INVALID_STATE');plan={name:'shift.activity',input:{shiftId:shift.id,activity:action==='BREAK'?'ON_BREAK':'WORKING',...action==='RESUME'?{siteId:shift.data.siteId}:{}},expectedVersion:shift.version,guards:[ref(shift),ref(await ctx.tx.get('site',shift.data.siteId))]};}
    return this.preview(ctx,`${this.text(ctx,action==='END'?'end':action==='BREAK'?'pause':'resume')}\n${shift.id}\n${shift.data.siteId}`,plan);
  }
  private async travel(ctx:RouteContext<Tx>,offset=0){this.require(ctx,'trip.manage');const shift=await this.activeShift(ctx);if(!shift)return this.respond(ctx,this.text(ctx,'noShift'),[{label:'MENU',intent:'MAIN'}],'TRAVEL');const trip=await this.activeTrip(ctx,shift);if(!trip)return this.travelDestinations(ctx,offset);ctx.accessRefs.push(ref(trip),ref(shift));return this.respond(ctx,`${this.text(ctx,'travel')} · ${trip.id}\n${trip.data.destination.kind} · ${trip.data.destination.id}\n${trip.data.purpose}`,shift.data.activity==='TRAVELLING'?[{label:this.text(ctx,'arrive'),intent:'TRIP_ARRIVE',payload:{tripId:trip.id,startWork:false},guards:[ref(trip),ref(shift)],permission:'trip.manage'},...trip.data.destination.kind==='SITE'?[{label:this.text(ctx,'arriveWork'),intent:'TRIP_ARRIVE',payload:{tripId:trip.id,startWork:true},guards:[ref(trip),ref(shift)],permission:'trip.manage'}]:[],{label:this.text(ctx,'pause'),intent:'BREAK',permission:'shift.manage'}]:[{label:this.text(ctx,'resume'),intent:'RESUME',permission:'shift.manage'},{label:'MENU',intent:'MAIN'}],'TRAVEL');}
  private async travelDestinations(ctx:RouteContext<Tx>,offset=0){this.require(ctx,'trip.manage');const shift=await this.activeShift(ctx);assert(shift,'INVALID_STATE');const sites=await this.visible(ctx,'site',s=>s.data.active!==false&&s.id!==shift.data.siteId&&ctx.actor.siteIds.includes(s.id));const warehouses=await this.visible(ctx,'stock_location',s=>s.data.type==='WAREHOUSE'&&s.data.active!==false);const destinations=[...sites.map(s=>({e:s,kind:'SITE'})),...warehouses.map(e=>({e,kind:'WAREHOUSE'}))];return this.page(ctx,this.text(ctx,'destination'),destinations.map(({e,kind})=>({label:label(e),intent:'TRAVEL_DESTINATION',payload:{destination:{kind,id:e.id},guard:ref(e)},guards:[ref(shift),ref(e)],permission:'trip.manage'})),'TRAVEL_PAGE',{},offset,'TRAVEL_DESTINATION');}
  private async materials(ctx:RouteContext<Tx>){this.require(ctx,'inventory.request');const requests=await this.visible(ctx,'material_request',r=>r.data.employeeId===ctx.actor.userId);ctx.accessRefs.push(...requests.slice(-5).map(ref));const summary=requests.slice(-5).map(r=>`${r.id} · ${r.data.quantityBase} · ${r.data.state}`).join('\n');return this.respond(ctx,`${this.text(ctx,'materials')}${summary?`\n${summary}`:''}`,[{label:this.text(ctx,'newRequest'),intent:'MATERIAL_NEW',permission:'inventory.request'},{label:'MENU',intent:'MAIN'}],'MATERIALS');}
  private async materialPicker(ctx:RouteContext<Tx>,siteId:string,offset=0){this.require(ctx,'inventory.request');const site=await ctx.tx.get('site',siteId);assert(await this.engine.visible(ctx.tx,ctx.actor,site),'ACCESS_DENIED');const materials=await this.visible(ctx,'material',m=>m.data.active!==false);return this.page(ctx,this.text(ctx,'material'),materials.map(m=>({label:m.data.names?.[ctx.language]??m.data.name,intent:'MATERIAL_SELECT',payload:{siteId,materialId:m.id},guards:[ref(site),ref(m)],permission:'inventory.request'})),'MATERIAL_PAGE',{siteId},offset,'MATERIAL');}
  private async payroll(ctx:RouteContext<Tx>,offset=0){this.require(ctx,'finance.payout.ack');const payouts=await this.visible(ctx,'payout',p=>p.data.employeeId===ctx.actor.userId&&p.data.state==='RECORDED'&&p.data.ackState==='UNCONFIRMED');return this.page(ctx,this.text(ctx,'payroll'),payouts.map(p=>({label:p.id,intent:'PAYOUT_SELECT',payload:{payoutId:p.id},guards:[ref(p)],permission:'finance.payout.ack'})),'PAYROLL_PAGE',{},offset,'PAYROLL');}
  private money(cents:number){assert(Number.isSafeInteger(cents)&&cents>=0,'VALIDATION_ERROR');return `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')} EUR`;}
  private async payout(ctx:RouteContext<Tx>,id:string){this.require(ctx,'finance.payout.ack');const payout=await ctx.tx.get('payout',id);assert(payout.data.employeeId===ctx.actor.userId&&await this.engine.visible(ctx.tx,ctx.actor,payout),'ACCESS_DENIED');ctx.accessRefs.push(ref(payout));return this.respond(ctx,`${this.text(ctx,'payroll')} · ${payout.id}\n${this.money(payout.data.amountCents)} · ${payout.data.method}\n${payout.data.transferredAt}`,['FULL','PARTIAL','DISPUTED'].map(decision=>({label:this.text(ctx,decision.toLowerCase()==='disputed'?'disputed':decision.toLowerCase()),intent:'PAYOUT_DECISION',payload:{payoutId:payout.id,decision},guards:[ref(payout)],permission:'finance.payout.ack'})),'PAYOUT');}
  private async tasks(ctx:RouteContext<Tx>,offset=0){this.require(ctx,'task.read');const tasks=await this.visible(ctx,'task',t=>t.data.assigneeIds?.includes(ctx.actor.userId)&&!['CANCELLED','ACCEPTED'].includes(t.data.state));return this.page(ctx,this.text(ctx,'tasks'),tasks.map(t=>({label:t.data.title,intent:'TASK_SELECT',payload:{taskId:t.id},guards:[ref(t)],permission:'task.read'})),'TASK_PAGE',{},offset,'TASKS');}
  private async task(ctx:RouteContext<Tx>,id:string){this.require(ctx,'task.read');const task=await ctx.tx.get('task',id);assert(task.data.assigneeIds?.includes(ctx.actor.userId)&&await this.engine.visible(ctx.tx,ctx.actor,task),'ACCESS_DENIED');ctx.accessRefs.push(ref(task));const choices:Choice[]=[];if(['ASSIGNED','BLOCKED','REOPENED'].includes(task.data.state))choices.push({label:this.text(ctx,'taskStart'),intent:'TASK_START',payload:{taskId:id},guards:[ref(task)],permission:'task.work'});if(task.data.state==='IN_PROGRESS')choices.push({label:this.text(ctx,'submit'),intent:'TASK_SUBMIT',payload:{taskId:id},guards:[ref(task)],permission:'task.work'});choices.push({label:'MENU',intent:'MAIN'});return this.respond(ctx,short(`${task.data.title}\n${task.id} · ${task.data.siteId}\n${task.data.description??''}\n${task.data.state}${this.web('/app')?`\n${this.web('/app')}`:''}`,3500),choices,'TASK');}
  private async chats(ctx:RouteContext<Tx>,offset=0){this.require(ctx,'chat.read');const channels=await this.visible(ctx,'channel',c=>!['PRIVATE_CUSTOMER_ASSISTANT'].includes(c.data.type));return this.page(ctx,this.text(ctx,'chats'),channels.map(c=>({label:c.data.name,intent:'CHAT_SELECT',payload:{channelId:c.id},guards:[ref(c)],permission:'chat.write'})),'CHAT_PAGE',{},offset,'CHATS');}
  private async admin(ctx:RouteContext<Tx>){assert(!external(ctx.actor),'ACCESS_DENIED');const pages:[string,string,string][]=[['bot.manage','settings','/app'],['integration.status','system','/app'],['identity.manage','people','/app'],['decision.manage','decisions','/app']];const available=pages.filter(([permission])=>ctx.actor.permissions.includes(permission));assert(available.length>0,'ACCESS_DENIED');for(const [p]of available)ctx.requiredPermissions.add(p);const links=available.map(([,label,path])=>`${this.text(ctx,label)}: ${this.web(path)??this.text(ctx,'web')}`).join('\n');return this.respond(ctx,`${this.text(ctx,'admin')}\n${links}\n${this.text(ctx,'noReauth')}`,[{label:'MENU',intent:'MAIN'}],'ADMIN');}
  private async flowPrompt(ctx:RouteContext<Tx>,flow:Flow){const key:Record<string,string>={TRAVEL_PURPOSE:'purpose',MATERIAL_QUANTITY:'quantity',MATERIAL_REASON:'reason',MATERIAL_DUE:'due',PAYOUT_AMOUNT:'amount',PAYOUT_STATEMENT:'statement',TASK_DESCRIPTION:'description',CHAT_COMPOSE:'compose'};const caps=this.options.capabilities;const interactive=caps?.accountVerified===true&&(caps.buttons||caps.lists);return this.respond(ctx,`${flow.step==='CHAT_COMPOSE'?`${flow.data.name} · ${flow.data.channelId}\n`:''}${this.text(ctx,key[flow.step]??'error')}${interactive?'':'\n/CANCEL · /MENU'}`,interactive?[{label:this.text(ctx,'cancel'),intent:'CANCEL'},{label:'MENU',intent:'MAIN'}]:[],flow.step);}
  private async flowInput(ctx:RouteContext<Tx>,flow:Flow,text:string):Promise<RouteStep>{assert(text.trim().length>0,'VALIDATION_ERROR');const p=flow.data;
    if(flow.step==='TRAVEL_PURPOSE'){assert(text.length<=500,'VALIDATION_ERROR');this.require(ctx,'trip.manage');return this.preview(ctx,`${this.text(ctx,'travel')}\n${p.destination.kind} · ${p.destination.id}\n${text}`,{name:'trip.start',input:{shiftId:p.shiftId,destination:p.destination,purpose:text},guards:[{kind:'shift',id:p.shiftId,version:p.shiftVersion},p.destinationGuard]});}
    if(flow.step==='MATERIAL_QUANTITY'){this.require(ctx,'inventory.request');const match=/^(\d+(?:[.,]\d{1,9})?)\s+(ml|l|g|kg|pcs|pair|package)$/.exec(text.trim());assert(match,'VALIDATION_ERROR');const quantity=match[1]!.replace(',','.');const material=await ctx.tx.get('material',p.materialId);exactBaseQuantity(material.data,quantity,match[2]!);await this.setFlow(ctx,{step:'MATERIAL_REASON',data:{...p,quantity,unit:match[2],originalQuantity:text}});return this.flowPrompt(ctx,ctx.session.data.flow);}
    if(flow.step==='MATERIAL_REASON'){assert(text.trim().length>=3&&text.length<=1000,'VALIDATION_ERROR');await this.setFlow(ctx,{step:'MATERIAL_DUE',data:{...p,reason:text}});return this.flowPrompt(ctx,ctx.session.data.flow);}
    if(flow.step==='MATERIAL_DUE'){assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text.trim())&&Number.isFinite(Date.parse(text.trim()))&&Date.parse(text.trim())>=Date.parse(ctx.now),'VALIDATION_ERROR');const input={materialId:p.materialId,siteId:p.siteId,quantity:p.quantity,unit:p.unit,dueAt:text.trim(),urgency:'NORMAL',reason:p.reason};return this.preview(ctx,`${this.text(ctx,'newRequest')}\n${p.siteId} · ${p.materialId}\n${p.originalQuantity}\n${p.reason}\n${text.trim()}\n${this.text(ctx,'draft')}`,{name:'request.create',input,guards:p.guards,presentation:'MATERIAL_DRAFT'});}
    if(flow.step==='PAYOUT_AMOUNT'){const amount=parseReceiptCents(text);assert(amount>0&&amount<p.amountCents,'VALIDATION_ERROR');await this.setFlow(ctx,{step:'PAYOUT_STATEMENT',data:{...p,receivedCents:amount,originalAmount:text}});return this.flowPrompt(ctx,ctx.session.data.flow);}
    if(flow.step==='PAYOUT_STATEMENT'){assert(text.trim().length>=3&&text.length<=1000,'VALIDATION_ERROR');const received=p.decision==='FULL'?p.amountCents:p.receivedCents??0;return this.preview(ctx,`${this.text(ctx,'payroll')} · ${p.payoutId}\n${this.money(p.amountCents)} · ${p.method}\n${this.text(ctx,p.decision==='FULL'?'full':p.decision==='PARTIAL'?'partial':'disputed')}: ${this.money(received)}\n${text}`,{name:'payout.ack',input:{payoutId:p.payoutId,decision:p.decision,...p.decision==='PARTIAL'?{receivedCents:p.receivedCents}:{},statement:text},expectedVersion:p.payoutVersion,guards:[{kind:'payout',id:p.payoutId,version:p.payoutVersion}]});}
    if(flow.step==='TASK_DESCRIPTION'){assert(text.length<=2000,'VALIDATION_ERROR');return this.preview(ctx,`${this.text(ctx,'submit')} · ${p.taskId}\n${text}`,{name:'task.submit',input:{taskId:p.taskId,description:text},expectedVersion:p.taskVersion,guards:[{kind:'task',id:p.taskId,version:p.taskVersion}]});}
    if(flow.step==='CHAT_COMPOSE'){assert(text.length<=12000,'VALIDATION_ERROR');this.require(ctx,'chat.write');const channel=await ctx.tx.get('channel',p.channelId);assert(channel.version===p.channelVersion&&await this.engine.visible(ctx.tx,ctx.actor,channel),'ACCESS_DENIED');let replyTo:string|undefined;if(ctx.source.data.reply_to_id){const message=await ctx.tx.get('message',ctx.source.data.reply_to_id);assert(message.data.channel_id===channel.id&&await this.engine.visible(ctx.tx,ctx.actor,message),'ACCESS_DENIED');replyTo=message.id;}return this.immediate(ctx,{name:'message.send',input:{channel_id:channel.id,text,language:originalMessageLanguage(text,ctx.language),...replyTo?{reply_to_id:replyTo}:{}},guards:[ref(channel)],presentation:'CHAT'});}
    return this.respond(ctx,this.text(ctx,'error'),[{label:'MENU',intent:'MAIN'}],'UNSUPPORTED');
  }
  private async media(ctx:RouteContext<Tx>,uploadId:string){this.require(ctx,'media.upload');const upload=await ctx.tx.get('media_upload',uploadId);if(upload.data.uploadedBy!==ctx.actor.userId||upload.data.scanState!=='CLEAN')return this.respond(ctx,this.text(ctx,'manualMedia')+(this.web()?`\n${this.web()}`:''),[{label:'MENU',intent:'MAIN'}],'MEDIA_MANUAL');const caption=ctx.input.media?.caption??ctx.input.text??'';assert(caption.length<=2000,'VALIDATION_ERROR');await this.setFlow(ctx,null,ctx.session.data.flow);return this.sitePicker(ctx,'MEDIA_SITE',{uploadId,caption});}
  private async mediaTasks(ctx:RouteContext<Tx>,data:Data,offset=0){this.require(ctx,'media.upload');const site=await ctx.tx.get('site',data.siteId),upload=await ctx.tx.get('media_upload',data.uploadId);assert(await this.engine.visible(ctx.tx,ctx.actor,site)&&upload.data.uploadedBy===ctx.actor.userId&&upload.data.scanState==='CLEAN','ACCESS_DENIED');const tasks=await this.visible(ctx,'task',t=>t.data.siteId===site.id&&t.data.state!=='CANCELLED');const choices:Choice[]=[{label:this.text(ctx,'siteOnly'),intent:'MEDIA_TASK',payload:{...data},guards:[ref(site),ref(upload)],permission:'media.upload'},...tasks.map(t=>({label:t.data.title,intent:'MEDIA_TASK',payload:{...data,taskId:t.id},guards:[ref(site),ref(upload),ref(t)],permission:'media.upload'}))];return this.page(ctx,this.text(ctx,'mediaTask'),choices,'MEDIA_TASK_PAGE',{...data},offset,'MEDIA_TASK');}
  private async mediaStages(ctx:RouteContext<Tx>,data:Data){const guards=[ref(await ctx.tx.get('site',data.siteId)),ref(await ctx.tx.get('media_upload',data.uploadId))];if(data.taskId)guards.push(ref(await ctx.tx.get('task',data.taskId)));return this.respond(ctx,this.text(ctx,'stage'),['BEFORE','AFTER','DEFECT','MATERIALS','DOCUMENT'].map(stage=>({label:this.text(ctx,stage),intent:'MEDIA_STAGE',payload:{...data,stage},guards,permission:'media.upload'})),'MEDIA_STAGE');}
  /** Root worker calls this immediately before actual provider I/O, then persists API_ACCEPTED/FAILED/UNKNOWN. */
  async prepareResponse(companyId:string,responseId:string){return this.db.transaction(companyId,this.options.systemActorId??'knaba-integration-service',async tx=>{
    const response=await tx.get('whatsapp_router_response',responseId);if(response.data.status!=='PENDING')return {allowed:false,reason:'ALREADY_PROCESSED'};
    const actor=await this.engine.actorIn(tx,response.data.user_id);await this.identity(tx,actor,response.data.sender);
    const session=await tx.get('whatsapp_router_session',response.data.session_id);
    if(response.data.expires_at<=this.now().toISOString()||session.data.generation!==response.data.session_generation){await tx.save(response,{...response.data,status:'CANCELLED',error:'SUPERSEDED_OR_EXPIRED'});return {allowed:false,reason:'SUPERSEDED_OR_EXPIRED'};}
    if(response.data.internal&&external(actor)||(response.data.required_permissions??[]).some((p:string)=>!actor.permissions.includes(p))){await tx.save(response,{...response.data,status:'CANCELLED',error:'ACCESS_REVOKED'});return {allowed:false,reason:'ACCESS_REVOKED'};}
    for(const r of response.data.access_refs??[])if(!await this.engine.visible(tx,actor,await tx.get(r.kind,r.id))){await tx.save(response,{...response.data,status:'CANCELLED',error:'ACCESS_REVOKED'});return {allowed:false,reason:'ACCESS_REVOKED'};}
    const settings=(await tx.list('notification_setting')).find(s=>s.data.user_id===actor.userId);
    const policy=whatsAppPolicy({now:this.now().toISOString(),last_inbound_at:settings?.data.last_inbound_at,consent:settings?.data.whatsapp_consent===true,opted_out:settings?.data.opted_out});
    if(!policy.allowed||policy.kind!=='TEXT'){await tx.save(response,{...response.data,status:'BLOCKED',error:policy.reason??'WHATSAPP_WINDOW_CLOSED'});return {allowed:false,reason:policy.reason??'WHATSAPP_WINDOW_CLOSED'};}
    if(this.options.mode!=='PRODUCTION'&&!this.options.testRecipients?.includes(response.data.sender)){await tx.save(response,{...response.data,status:'BLOCKED',error:'TEST_RECIPIENT_NOT_ALLOWED'});return {allowed:false,reason:'TEST_RECIPIENT_NOT_ALLOWED'};}
    return {allowed:true,to:response.data.sender,output:response.data.output as WhatsAppOutput,policy:{kind:'TEXT' as const},response};
  });}
}
