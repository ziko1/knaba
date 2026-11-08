import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {basename} from 'node:path';
import {build} from 'esbuild';
import ts from 'typescript';
import packs from '../src/data/assistant-widget-locales';

const original={"de":"c8e3ad311dcea1b9cd451660e15676c2433b6a86b6feca69781b86484b23a8cd","en":"e077a9a5b5b95bdea66e1ef0a6243876667c922b85061f94f5ff16727c916fa1","pl":"50f88508ed58f465ee209af94967b0fcdf2dd1008cd9a67f9d7245056420cbf0","lt":"505f7c830c799dbd340244a577316a9ce28beb5bc58fe4973355fed27ecb532b","uk":"7229a4f4ef3a159ffe5d25c8eff5baea0f1ec768ae4247ca692d85536596f2c8","ru":"b115c1d1244adc8620e666802f461fade262e964def911225a32a4c5ef482eee"};
const component=ts.createSourceFile('KnabaAssistant.tsx',readFileSync(new URL('../src/components/KnabaAssistant.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const parser=component.statements.filter(node=>(ts.isFunctionDeclaration(node)&&node.name?.text==='parseAssistantLabels')||(ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>item.name.getText(component)==='captionKeys'))).map(node=>node.getText(component)).join('\n');
const exported={} as {parseAssistantLabels:(value:unknown)=>typeof packs.de};
runInNewContext(ts.transpileModule(parser,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exported});
const layout=readFileSync(new URL('../src/layouts/Layout.astro',import.meta.url),'utf8');
const script=[...layout.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(text=>text.includes('async function mountAssistant'));
if(!script)throw Error('Actual widget loader is missing');
const source=ts.createSourceFile('loader.ts',script,ts.ScriptTarget.Latest,true);
const mount=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='mountAssistant');
if(!mount)throw Error('Actual widget mount function is missing');
const output=ts.transpileModule(mount.getText(source)+'\nexports.mount=mountAssistant;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(locale:keyof typeof packs='en',labels:unknown=packs[locale]){
  const root={dataset:{locale,labels:JSON.stringify(labels),pending:''},isConnected:true,replaceChildren:vi.fn()};
  const button={closest:()=>root,isConnected:true,disabled:false};
  const page=Object.assign(new EventTarget(),{documentElement:{lang:locale}}),location={href:''};
  const render=vi.fn((callback:()=>unknown)=>{callback();return dispose;}),dispose=vi.fn(),widget=vi.fn();
  let ready!:(module:unknown)=>void;const pending=new Promise(resolve=>{ready=resolve;});
  const loaded={default:widget,parseAssistantLabels:exported.parseAssistantLabels};
  const exports={} as {mount:(button:unknown)=>Promise<void>};
  runInNewContext(output,{exports,document:page,window:{location},require:(path:string)=>path==='solid-js/web'?{render}:pending});
  return {root,button,page,location,render,dispose,widget,mount:()=>exports.mount(button),release:()=>ready(loaded)};
}

describe('current-page assistant widget labels',()=>{
  it('retains the exact 40 original key/value pairs in each of six locale packs',()=>{
    for(const locale of Object.keys(packs) as (keyof typeof packs)[]){
      expect(Object.keys(packs[locale])).toHaveLength(40);
      expect(createHash('sha256').update(JSON.stringify(packs[locale])).digest('hex')).toBe(original[locale]);
      expect(exported.parseAssistantLabels(packs[locale])).toEqual(packs[locale]);
    }
  });
  it('keeps every long caption dictionary out of the browser module',async()=>{
    const result=await build({entryPoints:['src/components/KnabaAssistant.tsx'],bundle:true,write:false,format:'esm',platform:'browser',minify:true,charset:'utf8',logLevel:'silent',external:['solid-js','solid-js/web'],plugins:[{name:'asset-urls',setup(plugin){
      plugin.onResolve({filter:/\?url&no-inline$/},args=>({path:args.path,namespace:'asset-url'}));
      plugin.onLoad({filter:/.*/,namespace:'asset-url'},args=>({contents:'export default '+JSON.stringify('/_astro/'+basename(args.path.split('?')[0])),loader:'js'}));
    }}]});
    const code=result.outputFiles.map(file=>file.text).join('\n');
    for(const pack of Object.values(packs)){expect(code).not.toContain(pack.notice);expect(code).not.toContain(pack.codeWarning);}
    expect(code).not.toContain('data:application/json');
  });
  it.each(['de','en','pl','lt','ru','uk'] as const)('passes only the current %s pack through the actual lazy click adapter',async locale=>{
    const f=fixture(locale),first=f.mount(),duplicate=f.mount();f.release();await Promise.all([first,duplicate]);
    expect(f.render).toHaveBeenCalledOnce();expect(f.widget).toHaveBeenCalledExactlyOnceWith({locale,initialOpen:true,initialLabels:packs[locale]});
    expect(f.root.replaceChildren).toHaveBeenCalledOnce();expect(f.location.href).toBe('');
    f.page.dispatchEvent(new Event('astro:before-swap'));f.page.dispatchEvent(new Event('astro:before-swap'));expect(f.dispose).toHaveBeenCalledOnce();
  });
  it('never mounts a widget after its page was superseded while imports were pending',async()=>{
    const f=fixture(),pending=f.mount();f.page.dispatchEvent(new Event('astro:before-swap'));f.release();await pending;
    expect(f.render).not.toHaveBeenCalled();expect(f.root.replaceChildren).not.toHaveBeenCalled();expect(f.location.href).toBe('');
  });
  it('refuses an in-place locale/label change during loading without mounting mixed languages',async()=>{
    const f=fixture(),pending=f.mount();f.root.dataset.locale='uk';f.root.dataset.labels=JSON.stringify(packs.uk);f.release();await pending;
    expect(f.render).not.toHaveBeenCalled();expect(f.button.disabled).toBe(false);expect(f.root.dataset.pending).toBe('false');expect(f.location.href).toBe('');
  });
  it.each([null,{},[],{...packs.en,notice:'<script>unexpected</script>'},{...packs.en,unexpected:'key'}])('fails safely before mounting or starting private activity for invalid labels %#',async value=>{
    const f=fixture('en',value),pending=f.mount();f.release();await pending;
    expect(f.render).not.toHaveBeenCalled();expect(f.root.replaceChildren).not.toHaveBeenCalled();expect(f.location.href).toBe('/en/kontakt/');
  });
});
