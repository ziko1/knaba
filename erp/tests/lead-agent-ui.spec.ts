import {test,expect,type Page} from '@playwright/test';
import {LEAD_SOURCES,TRADE_CATEGORIES} from '../packages/domain/lead-agent-catalog.ts';
import {profileSchema} from '../packages/domain/lead-agent-model.ts';

const unexpected=new WeakMap<Page,string[]>();
test.afterEach(async({page})=>{expect(unexpected.get(page)??[],'Only explicit local HTTP fixtures and built assets are permitted').toEqual([]);});
async function fixture(page:Page,{seedProfile=false,seedDraft=false}={}){
  const origin=new URL(String(test.info().project.use.baseURL??'http://127.0.0.1:3000')).origin;
  const calls:Array<{name:string;body:any;csrf?:string}>=[],blocked:string[]=[],errors:string[]=[];
  unexpected.set(page,blocked);page.on('pageerror',e=>errors.push(e.message));let denied=false;
  const now=new Date().toISOString();
  const entity=(kind:string,id:string,data:any,version=1)=>({kind,id,companyId:'ui-company',version,data,createdAt:now,updatedAt:now});
  const p=entity('lead_agent_profile','ui-profile',{ownerUserId:'ui-user',profile:profileSchema.parse({name:'Synthetic Berlin',sources:['berlin_vergabe','ted'],categories:[]}),archived:false});
  const records:Record<string,any[]>={lead_agent_profile:seedProfile?[p]:[],lead_agent_opportunity:[],lead_agent_run:[],lead_agent_draft:seedDraft?[entity('lead_agent_draft','ui-draft',{ownerUserId:'ui-user',opportunityId:'ui-opportunity',status:'DRAFT',text:'Synthetic draft only',language:'DE',generator:'TEMPLATE',externalSendAvailable:false})]:[]};
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin){blocked.push(url.origin+url.pathname);return route.abort('blockedbyclient');}
    if(req.method()==='GET'&&(url.pathname.startsWith('/assets/')||['/','/app/lead-agent','/app','/login','/index.html','/icon.svg','/icon-maskable.svg','/manifest.webmanifest','/sw.js','/favicon.ico'].includes(url.pathname)))return route.continue();
    blocked.push(req.method()+' '+url.pathname);return route.abort('blockedbyclient');
  });
  await page.route('**/api/v1/me',route=>route.fulfill({json:{actor:{companyId:'ui-company',userId:'ui-user',roles:['OWNER'],permissions:['lead_agent.manage'],siteIds:[],customerIds:[],warehouseIds:[]},user:{id:'ui-user',name:'Synthetic test owner'},mode:'TEST',csrfToken:'ui-csrf'}}));
  await page.route('**/api/v1/public/config',route=>route.fulfill({json:{mode:'TEST',services:[],legal:{}}}));
  await page.route('**/api/v1/commands',route=>route.fulfill({json:{items:[{name:'lead_agent.catalog',permission:'lead_agent.manage',schema:{type:'object'}}]}}));
  await page.route('**/api/v1/dashboard',route=>route.fulfill({json:{counts:{},integrationStatus:{}}}));
  await page.route('**/api/v1/events',route=>route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'}));
  await page.route('**/api/v1/entities/**',route=>{
    if(denied)return route.fulfill({status:401,json:{code:'NEEDS_REAUTH'}});
    const kind=new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({json:{items:records[kind]??[],has_more:false,next_cursor:null}});
  });
  await page.route('**/api/v1/commands/lead_agent.*',async route=>{
    if(denied)return route.fulfill({status:401,json:{code:'NEEDS_REAUTH'}});
    const req=route.request(),name=new URL(req.url()).pathname.split('/').pop()!,body=req.postDataJSON();
    calls.push({name,body,csrf:req.headers()['x-csrf-token']});
    if(name==='lead_agent.catalog')return route.fulfill({json:{sources:LEAD_SOURCES,categories:TRADE_CATEGORIES,capabilities:{search:true,templateDrafts:true,externalSend:false,aiDrafts:false,platformLogin:false}}});
    if(name==='lead_agent.list')return route.fulfill({json:{items:records[body.input.kind]??[],has_more:false,next_cursor:null}});
    if(name==='lead_agent.run.read')return route.fulfill({json:records.lead_agent_run.find(r=>r.id===body.input.id)});
    if(name==='lead_agent.profile.save'){const saved=entity('lead_agent_profile',body.input.id??'ui-profile',{ownerUserId:'ui-user',profile:body.input.profile,archived:false},body.expected_version?body.expected_version+1:1);records.lead_agent_profile=[saved];return route.fulfill({json:saved});}
    if(name==='lead_agent.search'){const run=entity('lead_agent_run','ui-run',{ownerUserId:'ui-user',profileId:body.input.id,profileVersion:body.expected_version,status:'BLOCKED',reason:'PUBLIC_SEARCH_DISABLED',requestedAt:now,sources:[],seen:0,matched:0});records.lead_agent_run=[run];return route.fulfill({json:run});}
    if(name==='lead_agent.draft.save'){const d=records.lead_agent_draft[0];const saved={...d,version:d.version+1,data:{...d.data,text:body.input.text,status:'DRAFT'}};records.lead_agent_draft=[saved];return route.fulfill({json:saved});}
    if(name==='lead_agent.draft.review'){const d=records.lead_agent_draft[0];const saved={...d,version:d.version+1,data:{...d.data,status:'REVIEWED',reviewedAt:now,reviewPurpose:'INTERNAL_ONLY_NOT_SEND_AUTHORIZATION'}};records.lead_agent_draft=[saved];return route.fulfill({json:saved});}
    blocked.push(name);return route.abort('blockedbyclient');
  });
  await page.goto('/app/lead-agent?language=UK');
  await expect(page.getByRole('tab',{name:'Результати',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Оновити',exact:true}).last()).toBeEnabled();
  return {calls,errors,deny:()=>{denied=true;}};
}
test('HTTP fixture: a mobile operator creates a profile and sees the actual blocked search reason',async({page})=>{
  test.info().annotations.push({type:'transport-fixture',description:'Actual rendered UI; API replies are synthetic, separate from PostgreSQL worker acceptance.'});
  await page.setViewportSize({width:390,height:844});const f=await fixture(page);
  await page.getByRole('button',{name:'Створити профіль',exact:true}).click();await page.getByLabel('Назва профілю',{exact:true}).fill('Berlin Maler Test');
  await page.getByRole('button',{name:'Зберегти профіль',exact:true}).click();await expect(page.getByRole('button',{name:/Berlin Maler Test/})).toBeVisible();
  await page.getByRole('tab',{name:'Результати',exact:true}).click();await page.getByRole('button',{name:'Шукати зараз',exact:true}).click();
  await expect(page.getByText('Публічний пошук ще не ввімкнено на сервері',{exact:true})).toBeVisible();
  const save=f.calls.find(c=>c.name==='lead_agent.profile.save')!,search=f.calls.find(c=>c.name==='lead_agent.search')!;
  expect(save.body.input.profile).toMatchObject({name:'Berlin Maler Test',sources:['berlin_vergabe','ted'],minimumBudgetCents:null});expect(search.body.expected_version).toBe(1);expect(search.csrf).toBe('ui-csrf');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(f.errors).toEqual([]);
});
test('HTTP fixture: source cards never ask for passwords or pretend MyHammer is connected',async({page})=>{
  const f=await fixture(page);await page.getByRole('tab',{name:'Джерела й акаунти',exact:true}).click();
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'MyHammer',exact:true})});
  await expect(card).toContainText('Потрібен дозвіл платформи');await expect(card.getByRole('link').first()).toHaveAttribute('href','https://www.my-hammer.de/');
  expect(await page.locator('input[type=password]').count()).toBe(0);expect(f.calls.filter(c=>!['lead_agent.catalog','lead_agent.list','lead_agent.run.read'].includes(c.name))).toEqual([]);expect(f.errors).toEqual([]);
});
test('HTTP fixture: edited drafts must be saved before internal review and have no send control',async({page})=>{
  const f=await fixture(page,{seedProfile:true,seedDraft:true});await page.getByRole('tab',{name:'Чернетки',exact:true}).click();
  await page.getByLabel('Текст відповіді',{exact:true}).fill('Edited synthetic non-binding reply');await expect(page.getByRole('button',{name:'Позначити перевіреною',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Зберегти текст',exact:true}).click();await page.getByRole('button',{name:'Позначити перевіреною',exact:true}).click();
  await expect(page.getByText('Перевірено всередині KNABA',{exact:true})).toBeVisible();
  const actions=f.calls.filter(c=>!['lead_agent.catalog','lead_agent.list','lead_agent.run.read'].includes(c.name));expect(actions.map(c=>[c.name,c.body.expected_version])).toEqual([['lead_agent.draft.save',1],['lead_agent.draft.review',2]]);
  expect(await page.getByRole('button',{name:/Надіслати|Send|Senden/}).count()).toBe(0);expect(f.errors).toEqual([]);
});
test('HTTP fixture: denied refresh clears private profiles and removes the module',async({page})=>{
  const f=await fixture(page,{seedProfile:true});await page.getByRole('tab',{name:'Профілі',exact:true}).click();await expect(page.getByRole('button',{name:/Synthetic Berlin/})).toBeVisible();
  f.deny();await page.getByRole('button',{name:'Оновити',exact:true}).last().click();await expect(page.getByRole('tab',{name:'Профілі',exact:true})).toHaveCount(0);await expect(page.getByText('Synthetic Berlin',{exact:true})).toHaveCount(0);expect(f.errors).toEqual([]);
});
