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
  check(byClass(home,'carousel-track')[0],carousel.slice(1),prefix+'hero carousel');
  const catalog=parse(readFileSync(urlPath('leistungen/'),'utf8'));
  const sections=byClass(catalog,'bau-offer-grid');
  assert.equal(sections.length,2,prefix+'catalogue both sections');
  check(sections[0],core,prefix+'catalogue primary');
  check(sections[1],extras,prefix+'catalogue extras');
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
