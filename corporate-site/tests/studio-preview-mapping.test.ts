import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as contract from '../src/lib/site-studio-contract';

// Exercise the actual DOM application code with an explicit node fixture.
// This is a behavior test; real iframe/layout/browser acceptance stays separate.
const source=readFileSync(new URL('../src/scripts/site-studio-live.ts',import.meta.url),'utf8');
const script=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\nexports.apply=apply;';
const first='#main > section:nth-of-type(1) > p:nth-of-type(1)';
const second='#main > section:nth-of-type(1) > p:nth-of-type(2)';
class HtmlNode{
  childElementCount=0;blocked=false;textContent='Original';
  constructor(readonly tagName='P'){}
  closest(){return this.blocked?this:null;}
}
class Anchor extends HtmlNode{}
class Image extends HtmlNode{}
function fixture(){
  const a=new HtmlNode(),b=new HtmlNode();
  const elements=new Map<string,HtmlNode[]>([['main#main',[new HtmlNode('MAIN')]],[first,[a]],[second,[b]]]);
  const document={querySelectorAll:(selector:string)=>elements.get(selector)||[],querySelector:(selector:string)=>elements.get(selector)?.[0]||null};
  const exports={} as {apply:(entries:contract.StudioEntry[])=>boolean};
  runInNewContext(script,{exports,require:()=>contract,document,HTMLElement:HtmlNode,HTMLAnchorElement:Anchor,HTMLImageElement:Image});
  const entries=contract.validateStudioEntries([{selector:first,kind:'text',value:'First edit'},{selector:second,kind:'text',value:'Second edit'}]);
  return {a,b,elements,apply:exports.apply,entries};
}
describe('Studio preview all-or-nothing DOM application',()=>{
  it('keeps both original values when a later selector is absent',()=>{
    const view=fixture();view.elements.delete(second);
    expect(view.apply(view.entries)).toBe(false);
    expect(view.a.textContent).toBe('Original');expect(view.b.textContent).toBe('Original');
  });
  it('keeps both original values when later content became rich or belongs to a widget',()=>{
    for(const type of ['rich','widget']){
      const view=fixture();if(type==='rich')view.b.childElementCount=1;else view.b.blocked=true;
      expect(view.apply(view.entries)).toBe(false);
      expect(view.a.textContent).toBe('Original');expect(view.b.textContent).toBe('Original');
    }
  });
  it('applies a valid draft and removing it restores both baseline values',()=>{
    const view=fixture();expect(view.apply(view.entries)).toBe(true);
    expect(view.a.textContent).toBe('First edit');expect(view.b.textContent).toBe('Second edit');
    expect(view.apply([])).toBe(true);
    expect(view.a.textContent).toBe('Original');expect(view.b.textContent).toBe('Original');
  });
});
