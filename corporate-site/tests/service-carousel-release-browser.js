// Candidate browser acceptance. Prefix this script with `const overrides = {...};`.
// overrides keys are exact public URL paths; values contain {body, contentType}.
// No server mutation, authentication, form submission, or external AI request.
await (async () => {
  const started = Date.now();
  // Optional prefix: const qaOptions={locales:['pl'],widths:[390],regressions:false};
  const options = typeof qaOptions === 'undefined' ? {} : qaOptions;
  const deadlineMs = 115000;
  const browser = page.context().browser();
  const results = [];
  const checkedUrls = new Map();
  const failures = [];
  const screenshotNames = [];
  const origin = 'https://knaba.de';
  const mobileUA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const desktopUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const guard = () => assert(Date.now() - started < deadlineMs, 'BUDGET_DEADLINE_REACHED');
  const slugs = ['baureinigung','bauzwischenreinigung','bauendreinigung','baustellenraeumung','bauhilfe','kernbohrungen','durchbrueche','zusatzarbeiten'];
  const selectedIndex = async p => p.evaluate(() => {
    const track = document.querySelector('[data-carousel-track]');
    const slides = [...document.querySelectorAll('[data-carousel-slide]')];
    const distances = slides.map(s => Math.abs(s.offsetLeft - slides[0].offsetLeft - track.scrollLeft));
    const index = distances.indexOf(Math.min(...distances));
    return {index, distance: distances[index], counter: document.querySelector('[data-carousel-status]').textContent.trim(), dot: [...document.querySelectorAll('[data-carousel-dot]')].findIndex(d => d.getAttribute('aria-current') === 'true')};
  });
  const settle = async (p, target) => {
    await p.waitForFunction(index => {
      const t = document.querySelector('[data-carousel-track]');
      const s = [...document.querySelectorAll('[data-carousel-slide]')];
      const counter = document.querySelector('[data-carousel-status]');
      return t && s[index] && Math.abs(t.scrollLeft - (s[index].offsetLeft - s[0].offsetLeft)) < 3 && counter.textContent.trim() === String(index + 1).padStart(2, '0') + ' / 08';
    }, target, {timeout: 3500});
    const state = await selectedIndex(p);
    assert(state.dot === target, 'dot/scroll disagreement');
  };
  const newContext = async mode => {
    const context = await browser.newContext({viewport:{width:mode.width,height:mode.width===390?1200:1000},isMobile:mode.mobile,hasTouch:mode.touch,deviceScaleFactor:1,userAgent:mode.mobile?mobileUA:desktopUA,serviceWorkers:'block'});
    await context.route('https://knaba.de/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (Object.prototype.hasOwnProperty.call(overrides,path)) {
        const entry = overrides[path];
        return route.fulfill({status:200,body:entry.body,contentType:entry.contentType,headers:{'cache-control':'no-store'}});
      }
      return route.continue();
    });
    return context;
  };
  const modes = [
    {width:320,mobile:true,touch:true,name:'mobile-320'},
    {width:390,mobile:true,touch:true,name:'mobile-390'},
    {width:768,mobile:false,touch:false,name:'tablet-768'},
    {width:1280,mobile:false,touch:false,name:'desktop-1280'},
    {width:980,mobile:false,touch:true,name:'request-desktop-emulation-980'}
  ].filter(mode => !options.widths || options.widths.includes(mode.width));
  const regionalLocales = options.locales || ['pl','lt'];
  for (const lang of regionalLocales) {
    for (const mode of modes) {
      guard();
      let context;
      const record = {lang,mode:mode.name,width:mode.width,status:'FAIL'};
      try {
        context = await newContext(mode);
        const p = await context.newPage();
        p.setDefaultTimeout(4000);
        const errors = [], failedImages = [];
        p.on('pageerror', e => errors.push(e.message));
        p.on('response', r => { if (r.request().resourceType()==='image' && r.status()>=400) failedImages.push({url:r.url(),status:r.status()}); });
        const response = await p.goto(origin+'/'+lang+'/',{waitUntil:'domcontentloaded',timeout:12000});
        assert(response.status()===200,'homepage HTTP '+response.status());
        await p.waitForFunction(() => Boolean(customElements.get('knaba-service-carousel')),null,{timeout:5000});
        assert(await p.locator('knaba-service-carousel').count()===1,'one carousel');
        assert(await p.locator('[data-carousel-slide]').count()===8,'eight slides');
        assert(await p.locator('html').getAttribute('lang')===lang,'html lang');
        const layout = await p.evaluate(() => {
          const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          return {viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,copy:rect('.regional-hero-copy'),carousel:rect('knaba-service-carousel'),services:rect('#regional-services')};
        });
        assert(layout.viewport===mode.width,'effective viewport '+layout.viewport);
        assert(layout.overflow<=1,'horizontal overflow '+layout.overflow);
        assert(layout.carousel.width>0 && layout.carousel.height>0,'carousel visible geometry');
        assert(layout.carousel.bottom<=layout.services.y+1,'carousel precedes services');
        if(mode.width<=880) assert(layout.carousel.y>=layout.copy.bottom-1,'mobile carousel below copy');
        else assert(layout.carousel.x>=layout.copy.right-1 && layout.carousel.y<layout.copy.bottom,'wide carousel alongside copy');
        record.layout=layout;
        const links=await p.locator('.slide-link').evaluateAll(els=>els.map(a=>({href:a.getAttribute('href'),lang:a.getAttribute('hreflang'),label:a.textContent.trim()})));
        assert(links.every((a,i)=>a.href==='/bauleistungen/'+slugs[i]+'/'&&a.lang==='de'&&a.label.includes('(DE)')),'real disclosed DE destinations');
        const decoded=[];
        for(let i=0;i<8;i++) {
          await p.locator('[data-carousel-dot]').nth(i).click();
          await settle(p,i);
          const info=await p.locator('[data-carousel-slide]').nth(i).locator('img').evaluate(async img=>{await img.decode();return {src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,complete:img.complete,alt:img.alt};});
          assert(info.complete&&info.width>0&&info.height>0,'decoded image '+i);
          decoded.push(info);
        }
        record.images=decoded;
        const track=p.locator('[data-carousel-track]');
        await track.press('Home'); await settle(p,0);
        assert(await p.locator('[data-carousel-prev]').isDisabled(),'previous disabled at start');
        await p.locator('[data-carousel-next]').click(); await settle(p,1);
        await p.locator('[data-carousel-prev]').click(); await settle(p,0);
        await track.press('ArrowRight'); await settle(p,1);
        await track.press('ArrowLeft'); await settle(p,0);
        await track.press('End'); await settle(p,7);
        assert(await p.locator('[data-carousel-next]').isDisabled(),'next disabled at end');
        await track.press('Home'); await settle(p,0);
        record.controls='PASS: all dots, prev/next, ArrowLeft/Right, Home/End, actual scroll alignment';
        if(mode.touch) {
          await track.scrollIntoViewIfNeeded();
          const box=await track.boundingBox();
          const cdp=await context.newCDPSession(p);
          const startX=box.x+box.width*.85,endX=box.x+box.width*.12;
          const y=Math.max(10,Math.min(800,box.y+Math.min(box.height*.30,180)));
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y,radiusX:2,radiusY:2,force:1,id:1}]});
          for(let n=1;n<=12;n++) {
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX+(endX-startX)*n/12,y,radiusX:2,radiusY:2,force:1,id:1}]});
            await new Promise(resolve=>setTimeout(resolve,12));
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await p.waitForFunction(()=>document.querySelector('[data-carousel-track]').scrollLeft>40,null,{timeout:3500});
          await p.waitForFunction(()=>{const t=document.querySelector('[data-carousel-track]');const s=[...document.querySelectorAll('[data-carousel-slide]')];const i=s.findIndex(x=>Math.abs(x.offsetLeft-s[0].offsetLeft-t.scrollLeft)<3);return i>0&&document.querySelector('[data-carousel-status]').textContent.trim()===String(i+1).padStart(2,'0')+' / 08';},null,{timeout:3500});
          record.touch=await selectedIndex(p);
          assert(record.touch.index>0&&record.touch.dot===record.touch.index,'native swipe/counter agreement');
          await cdp.detach();
          await track.press('Home'); await settle(p,0);
        } else record.touch='NOT_APPLICABLE_NON_TOUCH_CONTEXT';
        if(mode.width===390||mode.width===1280) {
          await p.evaluate(()=>window.scrollTo(0,0));
          const name='candidate-'+lang+'-'+mode.width+'.jpg';
          console.log('SCREENSHOT '+JSON.stringify({name,base64:(await p.screenshot({type:'jpeg',quality:65,fullPage:false})).toString('base64')}));
          screenshotNames.push(name);
        }
        if(mode.width===390) {
          const other=lang==='pl'?'lt':'pl';
          await p.locator('.site-language-switcher > summary').click();
          await p.locator('a[data-language-switch][lang="'+other+'"]').click();
          await p.waitForURL(origin+'/'+other+'/',{timeout:6000});
          assert(await p.locator('html').getAttribute('lang')===other,'language switch html lang');
          assert(await p.locator('knaba-service-carousel').count()===1,'carousel after locale switch');
          await p.locator('[data-carousel-next]').click(); await settle(p,1);
          record.languageSwitch=lang+' -> '+other+': PASS, component interactive';
        }
        // Confirm each real article once, bounded and read-only. GET never submits a form.
        if(mode.width===1280) {
          for(const link of links) {
            if(!checkedUrls.has(link.href)) {
              const r=await context.request.get(origin+link.href,{timeout:8000});
              const html=await r.text();
              const result={status:r.status(),hasH1:/<h1\b/i.test(html)};
              checkedUrls.set(link.href,result);
              assert(result.status===200&&result.hasH1,'article '+link.href+' '+result.status);
            }
          }
          await track.press('End'); await settle(p,7);
          await p.locator('[data-carousel-slide]').last().locator('.slide-link').click();
          await p.waitForURL(origin+'/bauleistungen/zusatzarbeiten/',{timeout:6000});
          assert(await p.locator('h1').count()>0,'actual article CTA navigation');
          record.ctaNavigation='PASS';
        }
        assert(failedImages.length===0,'failed image responses '+JSON.stringify(failedImages));
        assert(errors.length===0,'page errors '+JSON.stringify(errors));
        record.pageErrors=errors;record.failedImages=failedImages;record.status='PASS';
      } catch(error) {
        record.error=String(error.stack||error);failures.push({lang,mode:mode.name,error:record.error});
      } finally { if(context) await context.close(); }
      results.push(record);
      console.log('SCENARIO '+JSON.stringify(record));
      if(Date.now()-started>=deadlineMs)break;
    }
    if(Date.now()-started>=deadlineMs)break;
  }
  const regressions=[];
  const regressionLocales=options.regressions===false?[]:['de','en','uk','ru'];
  for(const lang of regressionLocales) {
    if(Date.now()-started>=deadlineMs) { regressions.push({lang,status:'NOT_RUN',reason:'BUDGET_DEADLINE_REACHED'});continue; }
    let context;
    try {
      context=await newContext({width:390,mobile:true,touch:true});
      const p=await context.newPage();p.setDefaultTimeout(4000);
      const response=await p.goto(origin+(lang==='de'?'/':'/'+lang+'/'),{waitUntil:'domcontentloaded',timeout:10000});
      assert(response.status()===200,'HTTP '+response.status());
      const data=await p.evaluate(()=>({lang:document.documentElement.lang,count:document.querySelectorAll('knaba-service-carousel').length,slides:document.querySelectorAll('[data-carousel-slide]').length,overflow:document.documentElement.scrollWidth-innerWidth}));
      assert(data.lang===lang&&data.count===1&&data.slides===8&&data.overflow<=1,'regression structure '+JSON.stringify(data));
      await p.locator('[data-carousel-next]').click();await settle(p,1);
      const img=await p.locator('[data-carousel-slide]').nth(1).locator('img').evaluate(async i=>{await i.decode();return i.naturalWidth;});
      assert(img>0,'regression image');
      regressions.push({lang,status:'PASS',...data});
    }catch(error){regressions.push({lang,status:'FAIL',error:String(error.message||error)});}
    finally{if(context)await context.close();}
  }
  const expectedRegionalCases=regionalLocales.length*modes.length;
  const pass=results.length===expectedRegionalCases&&results.every(x=>x.status==='PASS')&&regressions.length===regressionLocales.length&&regressions.every(x=>x.status==='PASS');
  const summary={status:pass?'PASS':'FAIL',expectedRegionalCases,requestedOptions:options,environment:'Firecrawl Chromium; exact PL/LT HTML and carousel CSS route overrides; other assets/live routes unchanged',physicalDevice:'NOT_RUN',desktopMode:'Desktop UA + 980 CSS px + touch emulation; not physical Opera',durationMs:Date.now()-started,scenarios:results,regressions,articleResponses:Object.fromEntries(checkedUrls),screenshotNames,failures};
  console.log('QA_SUMMARY '+JSON.stringify(summary));
  return summary;
})();
