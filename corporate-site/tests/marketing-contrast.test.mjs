import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Source-token regression for the actual CSS gradients. This is conservative:
// every declared stop must meet WCAG AA normal-text contrast 4.5:1.
// It does NOT replace pixel sampling, screen-reader or physical-device QA.
const home=readFileSync(new URL('../src/components/ConstructionHome.astro',import.meta.url),'utf8');
const catalog=readFileSync(new URL('../src/components/ConstructionCatalog.astro',import.meta.url),'utf8');
const carousel=readFileSync(new URL('../src/components/ServiceCarousel.astro',import.meta.url),'utf8');
function rule(css,selector,requiredDeclaration){
  const escaped=selector.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
  const re=new RegExp('(?:^|\\})\\s*'+escaped+'\\s*\\{([^}]*)\\}','gm');
  const matches=[...css.matchAll(re)];
  assert.ok(matches.length,'Missing exact CSS rule: '+selector);
  // CSS contains media overrides without colour variables: select the
  // latest declaration of the relevant colour tokens, not the last size rule.
  const bodies=matches.map(match=>match[1]);
  if(selector.startsWith('.service-slide')) {
    const palette=bodies.filter(body=>body.includes('--card:')&&body.includes('--accent:'));
    assert.ok(palette.length,'Missing carousel palette tokens: '+selector);
    return palette.at(-1);
  }
  // Layout-only mobile overrides must not hide earlier palette values.
  if(requiredDeclaration){
    const declaration=new RegExp('(?:^|;)\\s*'+requiredDeclaration+'\\s*:','i');
    const candidates=bodies.filter(body=>declaration.test(body));
    assert.ok(candidates.length,'Missing '+requiredDeclaration+' declaration: '+selector);
    return candidates.at(-1);
  }
  return bodies.at(-1);
}
function normalizeHex(hex){
  assert.match(hex,/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i);
  return hex.length===4?'#'+[...hex.slice(1)].map(c=>c+c).join(''):hex;
}
function color(css,selector){
  const match=/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)\b/i.exec(rule(css,selector,'color'));
  assert.ok(match,'Missing foreground: '+selector);
  return normalizeHex(match[1]);
}
function stops(css,selector){
  const match=/(?:^|;)\s*background\s*:\s*linear-gradient\(([^;]+)\)/i.exec(rule(css,selector,'background'));
  assert.ok(match,'Missing gradient: '+selector);
  const result=(match[1].match(/#[0-9a-f]{6}\b/gi)||[]).map(normalizeHex);
  assert.ok(result.length>=2,'Missing stops: '+selector);
  return result;
}
function luminance(hex){
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
function contrast(foreground,background){
  const [hi,lo]=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
  return (hi+.05)/(lo+.05);
}
function expectContrast(foreground,backgrounds,scope){
  const min=Math.min(...backgrounds.map(bg=>contrast(foreground,bg)));
  assert.ok(min>=4.5,scope+': minimum '+min.toFixed(2)+':1 with '+foreground+' against '+backgrounds.join(','));
}
const homeStops=[1,2,3,4,5].flatMap(i=>stops(home,'.bau-card:nth-child('+i+')'));
for(const [label,selector] of [['description','.bau-card p'],['ordinal','.bau-ordinal'],['link','.bau-card-action']]){
  test('Home service-card '+label+' meets WCAG AA on all pastel stops',()=>expectContrast(color(home,selector),homeStops,label));
}
test('responsive layout override does not mask an earlier declared gradient or foreground',()=>{
  const css='.probe{color:#123456;background:linear-gradient(110deg,#f0f0f0,#ffffff)}'+
    '@media(max-width:600px){.other{display:block}.probe{grid-column:span 2}}';
  assert.equal(color(css,'.probe'),'#123456');
  assert.deepEqual(stops(css,'.probe'),['#f0f0f0','#ffffff']);
});
test('PR59 light homepage request-card foregrounds pass on its pastel gradient stops',()=>{
  const backgrounds=stops(home,'.bau-card.bau-card-request');
  for(const [label,selector] of [
    ['title','.bau-card.bau-card-request'],
    ['description','.bau-card.bau-card-request p'],
    ['ordinal','.bau-card-request .bau-ordinal'],
    ['link','.bau-card-request .bau-card-action']
  ])expectContrast(color(home,selector),backgrounds,'request '+label);
});
test('Service-carousel accents have 4.5:1 on their respective card colors',()=>{
  for(const selector of ['.service-slide',...[2,3,4,5,6,7,8].map(n=>'.service-slide:nth-child(8n + '+n+')')]){
    const css=rule(carousel,selector);
    const fg=(/--accent\s*:\s*(#[0-9a-f]{6})/i.exec(css)||[])[1];
    const bg=(/--card\s*:\s*(#[0-9a-f]{6})/i.exec(css)||[])[1];
    assert.ok(fg&&bg,selector+' missing color tokens');
    expectContrast(fg,[bg],selector+' accent');
  }
});
const catalogStops=[
  '.bau-offer:nth-child(3n + 1)',
  '.bau-offer:nth-child(3n + 2)',
  '.bau-offer:nth-child(3n)',
  '.bau-offer.special:nth-child(odd)',
  '.bau-offer.special:nth-child(even)'
].flatMap(selector=>stops(catalog,selector));
test('Catalogue card descriptions and links meet AA across warm/cool palettes',()=>{
  for(const [label,selector] of [['description','.bau-offer p'],['link','.bau-offer>span']])
    expectContrast(color(catalog,selector),catalogStops,'catalogue '+label);
});
test('Catalogue request CTA text meets AA on gradient endpoints',()=>{
  const backgrounds=stops(catalog,'.bau-offer.bau-offer-request');
  for(const [label,selector] of [
    ['heading','.bau-offer.bau-offer-request'],
    ['description','.bau-offer.bau-offer-request p'],
    ['link','.bau-offer.bau-offer-request>span']
  ])expectContrast(color(catalog,selector),backgrounds,'catalogue request '+label);
});


test('Hero catalogue pill and arrow maintain normal-text AA in default and hover states',()=>{
  for(const selector of ['.bau-secondary-cta','.bau-secondary-cta:hover','.bau-secondary-cta-arrow']){
    const css=rule(home,selector,'background');
    const match=/(?:^|;)\s*background\s*:\s*(#[0-9a-f]{6})\b/i.exec(css);
    assert.ok(match,selector+' expected solid background');
    expectContrast(color(home,selector),[normalizeHex(match[1])],selector);
  }
});
