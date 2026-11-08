/** Actual browser rendering and current SQLite/worker receipts, using synthetic capabilities only. */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as wait} from 'node:timers/promises';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function until(check,message){for(let i=0;i<160;i++){if(await check())return;await wait(50);}throw Error(message);}
const painted=page=>page.evaluate(async()=>{await new Promise(done=>requestAnimationFrame(done));await new Promise(done=>requestAnimationFrame(done));});
export async function assistantDisplayBrowserCase({browser,fixture,owner,record}){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const failures=[],external=[],calls=[];let releaseLate,lateFinished;
  function seed(){
    const ticket={id:randomUUID(),token:randomBytes(32).toString('hex')},created=new Date().toISOString();
    fixture.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,privacy_version,created_at,updated_at) VALUES(?,?,?,'en','human','synthetic-browser-display',?,?)")
      .run(ticket.id,createHash('sha256').update(ticket.token).digest('hex'),new Date(Date.now()+7*86400000).toISOString(),created,created);
    return ticket;
  }
  const displayed=id=>fixture.db.prepare('SELECT guest_displayed_at FROM assistant_messages WHERE id=?').get(id).guest_displayed_at;
  async function reply(ticket,content){
    const thread=await fixture.api('owner',`/api/assistant/owner/conversations/${ticket.id}/messages`,'POST',{content,idempotencyKey:randomUUID()});
    return thread.messages.find(message=>message.sender==='owner'&&message.content===content).id;
  }
  const first=seed(),second=seed();
  try{
    const top=await reply(first,'Synthetic older owner message above the visible scroll region.');
    const created=new Date().toISOString(),insert=fixture.db.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,content,request_key,created_at) VALUES(?,?,'customer',?,?,?)");
    for(let i=0;i<18;i++){const id=randomUUID();insert.run(id,first.id,('Synthetic visitor history '+i+'. ').repeat(12),id,created);}
    const bottom=await reply(first,'Synthetic visible owner response for display acceptance.');
    const secondMessage=await reply(second,'Synthetic second conversation must remain current.');
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin===fixture.origin)return route.continue();
      external.push({host:url.hostname,path:url.pathname});return route.abort('blockedbyclient');
    });
    const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
    page.on('pageerror',error=>failures.push(error.message));
    page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='POST'&&path.endsWith('/displayed'))calls.push({path,ids:request.postDataJSON().messageIds});});
    await page.addInitScript(ticket=>sessionStorage.setItem('knaba-assistant-ticket-v1',JSON.stringify(ticket)),first);
    assert.equal((await page.goto(fixture.origin+'/en/',{waitUntil:'domcontentloaded'})).status(),200);await page.bringToFront();
    assert.equal(await page.locator('.ka-panel').count(),0,'the guest widget starts closed');
    // A real GET while the lazy widget is closed must not imply display.
    const response=await page.evaluate(async ticket=>{
      const response=await fetch(`/api/assistant/conversations/${ticket.id}`,{headers:{'X-KnaBa-Conversation':ticket.token}});
      return {status:response.status,messages:(await response.json()).messages.length};
    },first);
    assert.equal(response.status,200);assert.ok(response.messages>=20);await painted(page);
    assert.equal(displayed(top),null);assert.equal(displayed(bottom),null);assert.equal(calls.length,0);
    record('closed guest widget and actual thread GET leave owner display unconfirmed',{caseId:'assistant.display.closed'});
    await page.locator('[data-knaba-open]').click();await page.locator('.ka-panel').waitFor({state:'visible'});
    await until(()=>typeof displayed(bottom)==='string','Visible owner message was not acknowledged by the actual worker');
    assert.equal(displayed(top),null,'offscreen owner message must remain unconfirmed');
    const geometry=await page.locator('.ka-history').evaluate((log,ids)=>{
      const bounds=log.getBoundingClientRect();return ids.map(id=>{const node=log.querySelector(`[data-owner-message-id="${id}"]`),box=node.getBoundingClientRect();return {id,intersects:box.bottom>bounds.top&&box.top<bounds.bottom&&box.bottom>0&&box.top<innerHeight};});
    },[top,bottom]);
    assert.deepEqual(geometry.map(item=>item.intersects),[false,true]);
    const firstTime=displayed(bottom);
    await page.locator('.ka-history').evaluate(log=>{log.scrollTop=0;});
    await until(()=>typeof displayed(top)==='string','Scrolling the actual owner node into view did not acknowledge it');
    assert.equal(displayed(bottom),firstTime);
    record('only visible owner nodes receive immutable first display timestamps; scrolling confirms the older node',{caseId:'assistant.display.visible'});

    assert.equal((await owner.goto(fixture.origin+'/postfach/?conversation='+first.id,{waitUntil:'domcontentloaded'})).status(),200);
    await owner.locator('.ki-grid').waitFor({state:'visible'});await owner.locator('.ki-language select').selectOption('en');
    await owner.waitForFunction(()=>document.querySelector('.ki-shell')?.getAttribute('lang')==='en');
    const copy=JSON.parse(readFileSync(new URL('../src/data/assistant-inbox-locales/inbox-en.json',import.meta.url),'utf8'));
    const ownerMessage=owner.locator('.ki-from-owner').filter({hasText:'Synthetic visible owner response for display acceptance.'});
    await ownerMessage.waitFor({state:'visible'});assert.ok((await ownerMessage.textContent()).includes(copy.displayed));
    assert.ok(!(await ownerMessage.textContent()).includes(copy.displayUnconfirmed));
    record('authenticated owner inbox renders the actual server display receipt without a human-read claim',{caseId:'assistant.display.owner-label'});

    const late=await reply(first,'Synthetic delayed first-conversation response must never replace another thread.');
    const release=deferred(),finished=deferred();releaseLate=release.resolve;lateFinished=finished.promise;
    let transport='released',held=false,fetchedStatus,transportError,cancelled=false;
    page.on('requestfailed',request=>{if(new URL(request.url()).pathname===`/api/assistant/conversations/${first.id}`&&/ABORTED|cancel/i.test(request.failure()?.errorText??''))cancelled=true;});
    await page.route('**/api/assistant/conversations/'+first.id,async route=>{
      if(held||route.request().method()!=='GET')return route.continue();held=true;
      try{const actual=await route.fetch();fetchedStatus=actual.status();await release.promise;await route.fulfill({response:actual});}
      catch(error){if(fetchedStatus===200&&!/ERR_BLOCKED_BY_ADMINISTRATOR/i.test(error.message))transport=cancelled?'cancelled-after-reset':'late-response-not-delivered';else transportError=error;}
      finally{finished.resolve();}
    });
    await page.bringToFront();await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-knaba-open]').click();
    await until(()=>fetchedStatus!==undefined||transportError,'Reloaded guest request never reached the deliberate delayed transport');
    if(transportError)throw transportError;assert.equal(fetchedStatus,200,'delayed payload comes from the actual current worker');
    page.once('dialog',dialog=>dialog.accept());await page.locator('.ka-reset').click();
    await page.locator('#ka-recovery-code').fill(`KNABA1:${second.id}:${second.token}`);
    await page.locator('.ka-recovery button[type="submit"]').click();
    await until(()=>typeof displayed(secondMessage)==='string','Restored second conversation did not receive its own visible receipt');
    release.resolve();await finished.promise;if(transportError)throw transportError;await painted(page);
    assert.ok((await page.locator('.ka-history').textContent()).includes('Synthetic second conversation must remain current.'));
    assert.ok(!(await page.locator('.ka-history').textContent()).includes('Synthetic delayed first-conversation response'));
    assert.equal(displayed(late),null);
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('knaba-assistant-ticket-v1')).id),second.id);
    const secondCalls=calls.filter(call=>call.path===`/api/assistant/conversations/${second.id}/displayed`);
    assert.ok(secondCalls.length>0);assert.ok(secondCalls.every(call=>call.ids.length===1&&call.ids[0]===secondMessage));
    assert.ok(calls.every(call=>!call.ids.includes(late)));
    assert.equal(fixture.db.prepare('SELECT COUNT(*) AS n FROM assistant_notifications WHERE conversation_id IN (?,?)').get(first.id,second.id).n,0);
    assert.deepEqual(failures,[]);assert.deepEqual(external,[]);
    record('reset and delayed real HTTP response cannot acknowledge or restore another conversation',{caseId:'assistant.display.reset',lateTransport:transport});
  }finally{releaseLate?.();if(lateFinished)await Promise.race([lateFinished,wait(1000)]);await context.close();}
}
