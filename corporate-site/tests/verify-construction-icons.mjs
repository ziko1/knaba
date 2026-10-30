import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';

const core=['baureinigung','bauzwischenreinigung','bauendreinigung','project','bauhilfe','baustellenraeumung'];
const extras=['kernbohrungen','durchbrueche','zusatzarbeiten'];
const offers=core.filter(slug=>slug!=='project').concat(extras);
// The eight-service hero carousel intentionally keeps the published offer order;
// the planner is only a grid CTA and does not change service numbering.
const carousel=['baureinigung','bauzwischenreinigung','bauendreinigung','baustellenraeumung','bauhilfe',...extras];
const attr=(node,name)=>(node.attrs||[]).find(item=>item.name===name)?.value;
const cls=(node,name)=>(attr(node,'class')||'').split(/\s+/).includes(name);
function all(node,pred,out=[]){
  if(pred(node))out.push(node);
  for(const child of node.childNodes||[])all(child,pred,out);
  return out;
}
const byClass=(node,name)=>all(node,child=>cls(child,name));
const symbols=node=>all(node,child=>child.tagName==='svg'&&attr(child,'data-construction-icon'));
function check(container,names,label){
  assert.ok(container,label+': no container');
  const icons=symbols(container);
  assert.deepEqual(icons.map(i=>attr(i,'data-construction-icon')),names,label+': SVG name order');
  for(const svg of icons){
    assert.equal(attr(svg,'aria-hidden'),'true',label+': decorative aria');
    assert.equal(attr(svg,'focusable'),'false',label+': skip keyboard tab');
    assert.equal(attr(svg,'fill'),'none',label+': no unapproved brand fill');
    assert.ok(attr(svg,'width')&&attr(svg,'height'),label+': icon dimensions prevent shift');
    assert.equal(all(svg,c=>c.tagName==='path').length,1,label+': fixed local pictogram');
  }
}
let verified=0;
for(const prefix of ['','en/','uk/','ru/']){
  const urlPath=(route)=>new URL('../dist/client/'+prefix+route+'index.html',import.meta.url);
  const home=parse(readFileSync(urlPath(''),'utf8'));
  check(byClass(home,'bau-card-grid')[0],core,prefix+'home primary');
  check(byClass(home,'bau-extra-list')[0],extras,prefix+'home extras');
  const track=byClass(home,'carousel-track')[0];
  assert.ok(track,prefix+'hero carousel present');
  // Carousel slide 01 keeps the original SVG illustration; slides 02-08
  // intentionally use seven original WebPs instead of repeated SVG pictograms.
  const heroImages=all(track,n=>n.tagName==='img');
  assert.deepEqual(heroImages.map(n=>attr(n,'src')),[
    '/illustrations/baureinigung.svg',
    ...carousel.slice(1).map(slug=>'/illustrations/carousel/'+slug+'.webp')
  ],prefix+'hero artwork order');
  assert.equal(symbols(track).length,0,prefix+'no duplicated service icon overlays');
  for(const image of heroImages.slice(1)){
    assert.equal(attr(image,'loading'),'lazy',prefix+'deferred artwork');
    assert.equal(attr(image,'alt'),'',prefix+'artwork is decorative with repeated text caption');
    assert.equal(attr(image.parentNode,'aria-hidden'),'true',prefix+'decorative section hidden from AT');
    assert.equal(attr(image,'width'),'960');
    assert.equal(attr(image,'height'),'550');
  }
  const catalog=parse(readFileSync(urlPath('leistungen/'),'utf8'));
  const sections=byClass(catalog,'bau-offer-grid').filter(section=>!cls(section,'project-intents-grid'));
  assert.equal(sections.length,2,prefix+'catalogue original core and extra sections');
  check(sections[0],core,prefix+'catalogue primary');
  check(sections[1],extras,prefix+'catalogue extras');
  const intentSections=byClass(catalog,'project-intents-grid');
  assert.equal(intentSections.length,1,prefix+'one buyer guidance section');
  const intentCards=byClass(intentSections[0],'bau-offer');
  assert.equal(intentCards.length,6,prefix+'six distinct buyer cases');
  assert.equal(symbols(intentSections[0]).length,0,prefix+'text-only buyer cases do not duplicate pictograms');
  const expectedIntents=['baureinigung','bauzwischenreinigung','bauendreinigung','baustellenraeumung','bauhilfe','kernbohrungen'];
  const anchors=all(intentSections[0],node=>node.tagName==='a');
  assert.deepEqual(anchors.map(node=>attr(node,'href')),expectedIntents.map(slug=>'/'+prefix+'bauleistungen/'+slug+'/'),prefix+'buyer guide links to active service pages');
  for(const slug of offers){
    const doc=parse(readFileSync(urlPath('bauleistungen/'+slug+'/'),'utf8'));
    const label=byClass(doc,'service-type-label');
    assert.equal(label.length,1,prefix+slug+': detail label');
    check(label[0],[slug],prefix+slug+': detail pictogram');
    verified++;
  }
  verified+=5;
}
console.log('PASS: '+verified+' localized SVG icon placements/sections (DE,EN,UK,RU; 8 details per locale), static/a11y');
