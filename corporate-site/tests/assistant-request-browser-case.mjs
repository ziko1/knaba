/** Same installed browser, real isolated SQLite/worker, synthetic guest data only. */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
async function until(check,message){for(let attempt=0;attempt<160;attempt++){if(await check())return;await wait(50);}throw Error(message);}

export async function assistantRequestBrowserCase({browser,fixture,owner,record,output}){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const ticket={id:randomUUID(),token:randomBytes(32).toString('hex')},created=new Date().toISOString();
  const comment='Synthetic local assistant request '+randomUUID(),bodies=[],paths=[],external=[],errors=[];
  const en=JSON.parse(readFileSync(new URL('../src/data/assistant-inbox-locales/inbox-en.json',import.meta.url),'utf8'));
  const uk=JSON.parse(readFileSync(new URL('../src/data/assistant-inbox-locales/inbox-uk.json',import.meta.url),'utf8'));
  fixture.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,contact_name,contact_email,contact_phone,privacy_version,created_at,updated_at) VALUES(?,?,?,'en','human',?,?,?,'synthetic-browser-request',?,?)")
    .run(ticket.id,createHash('sha256').update(ticket.token).digest('hex'),new Date(Date.now()+7*86400000).toISOString(),'Synthetic guest','guest-conversion@example.test','+491234567890',created,created);
  let page,createdReceipt,transportError;
  const links=()=>fixture.db.prepare('SELECT r.id,r.status,r.version,r.message FROM assistant_request_links l JOIN cleaning_requests r ON r.id=l.request_id WHERE l.conversation_id=?').all(ticket.id);
  try{
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin===fixture.origin)return route.continue();
      external.push({host:url.hostname,path:url.pathname});return route.abort('blockedbyclient');
    });
    page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST')paths.push(new URL(request.url()).pathname);});
    await page.addInitScript(value=>sessionStorage.setItem('knaba-assistant-ticket-v1',JSON.stringify(value)),ticket);
    assert.equal((await page.goto(fixture.origin+'/en/',{waitUntil:'domcontentloaded'})).status(),200);
    await page.locator('[data-knaba-open]').click();await page.locator('.ka-panel').waitFor({state:'visible'});
    const action=page.locator('.ka-panel a[href="/en/kontakt/?intent=assistant"]');await action.waitFor({state:'visible'});
    assert.equal(new URL(await action.getAttribute('href'),fixture.origin).search,'?intent=assistant');
    await action.click();await page.waitForURL(url=>url.pathname==='/en/kontakt/'&&url.search==='?intent=assistant');
    await page.locator('#inquiry-service').selectOption('bauhilfe');await page.locator('.wizard form button[type="submit"]').click();
    await page.locator('#inquiry-postcode').fill('10315');await page.locator('#inquiry-frequency').selectOption('Einmalig');
    await page.locator('.wizard form button[type="submit"]').click();
    assert.equal(await page.locator('#inquiry-name').inputValue(),'Synthetic guest');assert.equal(await page.locator('#inquiry-email').inputValue(),'guest-conversion@example.test');
    await page.locator('#inquiry-message').fill(comment);await page.locator('.wizard form button[type="submit"]').click();
    const send=()=>page.locator('.wizard button.button-dark');
    assert.equal(await send().count(),1);assert.equal(await send().isDisabled(),true);
    await page.locator('.privacy-check input:not(#inquiry-transfer-consent)').check();assert.equal(await send().isDisabled(),true);
    assert.equal(await page.locator('#inquiry-transfer-consent').isChecked(),false);
    assert.ok((await page.locator('#inquiry-transfer-fields').textContent()).includes(en.requestLocalOnly));
    await page.locator('#inquiry-transfer-consent').check();assert.equal(await send().isEnabled(),true);assert.equal(links().length,0);
    record('guest explicitly opens the structured form with an intent-only URL and separate unchecked ERP consent',{caseId:'assistant.request.explicit-consent'});

    // The server creates the first request. Only its network response is lost;
    // the subsequent retry must use identical bytes and the same idempotency key.
    await page.route('**/api/assistant/conversations/'+ticket.id+'/requests',async route=>{
      if(route.request().method()!=='POST')return route.continue();
      bodies.push(route.request().postData());
      try{
        const actual=await route.fetch();assert.ok([200,201].includes(actual.status()));
        if(bodies.length===1){createdReceipt=await actual.json();await route.abort('failed');}
        else await route.fulfill({response:actual});
      }catch(error){transportError=error;await route.abort().catch(()=>{});}
    });
    await send().click();await until(()=>createdReceipt||transportError,'Actual request did not reach the deliberate lost-response boundary');if(transportError)throw transportError;
    await page.getByText(en.requestError,{exact:true}).first().waitFor({state:'visible'});assert.equal(links().length,1);
    assert.equal(createdReceipt.received,true);assert.equal(createdReceipt.conversationId,ticket.id);assert.equal(createdReceipt.request.erpTransfer.status,'PENDING');
    await page.locator('.site-language-switcher > summary').click();
    const language=page.locator('a[data-language-switch][hreflang="uk"]');assert.equal(new URL(await language.getAttribute('href'),fixture.origin).search,'?intent=assistant');
    await language.click();await page.waitForURL(url=>url.pathname==='/uk/kontakt/'&&url.search==='?intent=assistant');
    await page.locator('#inquiry-summary').waitFor({state:'visible'});assert.ok((await page.locator('#inquiry-summary').inputValue()).includes(comment));
    assert.equal(await page.locator('.privacy-check input:not(#inquiry-transfer-consent)').isChecked(),false);assert.equal(await page.locator('#inquiry-transfer-consent').isChecked(),false);
    assert.equal(await send().isDisabled(),true);
    await page.locator('.privacy-check input:not(#inquiry-transfer-consent)').check();await page.locator('#inquiry-transfer-consent').check();await send().click();
    const confirmed=page.locator('.receipt-card:not([data-assistant-request]) code');await confirmed.waitFor({state:'visible'});
    assert.equal((await confirmed.textContent()).trim(),createdReceipt.id);assert.equal(bodies.length,2);assert.equal(bodies[1],bodies[0]);assert.equal(links().length,1);
    assert.ok(links()[0].message.includes(comment));assert.equal(fixture.db.prepare('SELECT COUNT(*) AS n FROM assistant_messages WHERE conversation_id=?').get(ticket.id).n,0);
    const guestCard=page.locator(`[data-assistant-request="${createdReceipt.id}"]`);await guestCard.waitFor({state:'visible'});
    assert.ok((await guestCard.textContent()).includes(uk.transfer_PENDING));assert.ok(!(await guestCard.textContent()).includes(uk.transfer_APPLIED));
    record('lost actual HTTP response and language navigation retry one immutable request without chat copying or a false ERP-applied claim',{caseId:'assistant.request.retry',requests:1,attempts:2,erpFixture:'disabled dispatcher; maintenance scheduler paused; initial PENDING queue, not applied'});

    await owner.goto(fixture.origin+'/postfach/?conversation='+ticket.id+'&lang=en',{waitUntil:'domcontentloaded'});
    await owner.locator('.ki-language select').selectOption('en');await owner.waitForFunction(()=>document.querySelector('.ki-shell')?.getAttribute('lang')==='en');
    const ownerCard=owner.locator(`[data-assistant-request="${createdReceipt.id}"]`);await ownerCard.waitFor({state:'visible'});
    assert.ok((await ownerCard.textContent()).includes(en.request_new));assert.ok((await ownerCard.textContent()).includes(en.transfer_PENDING));
    assert.ok((await owner.locator('.ki-body').textContent()).includes(en.requestSource));
    page.once('dialog',dialog=>dialog.dismiss());await guestCard.getByRole('button',{name:uk.requestCancel,exact:true}).click();assert.equal(links()[0].status,'new');
    page.once('dialog',dialog=>dialog.accept());await guestCard.getByRole('button',{name:uk.requestCancel,exact:true}).click();
    await until(()=>links()[0]?.status==='cancelled','Guest withdrawal did not reach the actual request row');
    await until(async()=>String(await guestCard.textContent()).includes(uk.request_cancelled),'Cancelled request status was not rendered');assert.equal(links()[0].version,2);
    assert.ok((await page.locator('.wizard').textContent()).includes(uk.requestCancelBoundary));
    record('owner inbox shows the immutable source association; explicit guest withdrawal updates the real version without deleting request history',{caseId:'assistant.request.withdrawal'});

    owner.once('dialog',dialog=>dialog.accept());await owner.getByRole('button',{name:en.revoke,exact:true}).click();
    await until(()=>fixture.db.prepare('SELECT token_revoked_at FROM assistant_conversations WHERE id=?').get(ticket.id).token_revoked_at,'Owner access revocation did not persist');
    await page.getByRole('button',{name:uk.requestRefresh,exact:true}).click();await page.getByText(uk.requestUnavailable,{exact:true}).waitFor({state:'visible'});
    assert.equal(await page.locator('[data-assistant-request]').count(),0);assert.equal(await page.locator('#inquiry-summary').count(),0);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('knaba-assistant-ticket-v1')),null);assert.equal(links().length,1);
    assert.ok(paths.every(path=>path!=='/api/leads'));assert.deepEqual(external,[]);assert.deepEqual(errors,[]);if(transportError)throw transportError;
    record('revoked capability clears guest request data and never falls back to public lead creation',{caseId:'assistant.request.revoked'});
  }catch(error){if(page&&!page.isClosed())await page.screenshot({path:join(output,'assistant-request-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();}
}
