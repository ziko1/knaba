import {describe,it,expect} from 'vitest';
import {studioMappingCompatible} from '../src/lib/site-studio-mapping';
import {validateStudioEntries} from '../src/lib/site-studio-contract';
import {renderPublishedPage} from '../vps/render-page.mjs';

const html='<!doctype html><html><head><title>KnaBa</title><meta name="description" content="Original"><meta property="og:title" content="KnaBa"><meta property="og:description" content="Original"></head><body><main id="main"><section><p>Original</p><a href="/">Home <span>→</span></a><img src="/images/test.png" alt="Original"></section></main><script>window.unchanged=true</script></body></html>';
const text='#main > section:nth-of-type(1) > p:nth-of-type(1)';
const missing='#main > section:nth-of-type(2) > p:nth-of-type(1)';
const edits=validateStudioEntries([{selector:text,kind:'text',value:'New copy'},{selector:'@title',kind:'text',value:'New title'}]);
const row=(entries:unknown)=>({published_version:1,published_json:JSON.stringify(entries)});

describe('Studio whole-page mapping compatibility',()=>{
  it('renders the whole valid set while preserving markup and script bytes',()=>{
    expect(studioMappingCompatible(html,edits)).toBe(true);
    const result=renderPublishedPage(html,row(edits));
    expect(result).toContain('<p>New copy</p>');expect(result).toContain('<title>New title</title>');
    expect(result).toContain('<a href="/">Home <span>→</span></a>');
    expect(result).toContain('<script>window.unchanged=true</script>');
  });
  it('never partially renders a published set after one target disappears',()=>{
    const mixed=validateStudioEntries([...edits,{selector:missing,kind:'text',value:'Missing'}]);
    expect(studioMappingCompatible(html,mixed)).toBe(false);
    expect(renderPublishedPage(html,row(mixed))).toBe(html);
  });
  it.each([
    html.replace('<p>Original</p>','<p>Original <strong>preserve</strong></p>'),
    html.replace('<p>Original</p>','<p contenteditable>Original</p>'),
    html.replace('<section>','<section data-knaba-widget>'),
    html.replace('</body>','<main id="main"><p>Other</p></main></body>'),
    html.replace('</head>','<title>Ambiguous</title></head>'),
  ])('rejects ambiguous/noneditable source without changing any public bytes',source=>{
    expect(studioMappingCompatible(source,edits)).toBe(false);
    expect(renderPublishedPage(source,row(edits))).toBe(source);
  });
  it('allows a rich link destination and image alternative without erasing their content',()=>{
    const entries=validateStudioEntries([
      {selector:'#main > section:nth-of-type(1) > a:nth-of-type(1)',kind:'href',value:'/leistungen/'},
      {selector:'#main > section:nth-of-type(1) > img:nth-of-type(1)',kind:'alt',value:'Meaningful description'},
    ]);
    expect(studioMappingCompatible(html,entries)).toBe(true);
    const result=renderPublishedPage(html,row(entries));
    expect(result).toContain('<a href="/leistungen/">Home <span>→</span></a>');
    expect(result).toContain('alt="Meaningful description"');
  });
  it('uses an actual UTF-8 byte limit, including the exact accepted boundary',()=>{
    const boundary=html+' '.repeat(400_000-new TextEncoder().encode(html).byteLength);
    expect(studioMappingCompatible(boundary,edits)).toBe(true);
    expect(studioMappingCompatible(boundary+'x',edits)).toBe(false);
    expect(studioMappingCompatible(html+'я'.repeat(200_000),edits)).toBe(false);
  });
});
