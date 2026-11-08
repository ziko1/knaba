import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';
import de from '../src/data/portal-locales/de.json';
import en from '../src/data/portal-locales/en.json';
import pl from '../src/data/portal-locales/pl.json';
import lt from '../src/data/portal-locales/lt.json';
import ru from '../src/data/portal-locales/ru.json';
import uk from '../src/data/portal-locales/uk.json';
import {createPortalLocaleStore,type PortalLocalePack} from '../src/lib/portal-locale-store';

const packs={de,en,pl,lt,ru,uk};
type Locale=keyof typeof packs;
type Store=ReturnType<typeof createPortalLocaleStore>;
const pack=(locale:Locale)=>packs[locale] as PortalLocalePack;
const compilerOptions={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022};

function component(name:'Portal'|'AdminControlCenter'){
  const source=ts.createSourceFile(name+'.tsx',readFileSync(new URL('../src/components/'+name+'.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const entry=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name) as ts.FunctionDeclaration;
  if(!entry?.body)throw Error('Missing workspace entry');
  return {source,entry};
}

/** Execute the real entry statements before its first state/read can be created. */
function bootstrap(name:'Portal'|'AdminControlCenter',props:Record<string,unknown>,store:Store){
  const {source,entry}=component(name);
  const stateIndex=entry.body!.statements.findIndex(node=>ts.isVariableStatement(node)&&/createSignal|new QueryClient/.test(node.getText(source)));
  if(stateIndex<0)throw Error('Missing initial workspace state');
  const prefix=entry.body!.statements.slice(0,stateIndex).map(node=>node.getText(source)).join('\n');
  runInNewContext(ts.transpileModule(prefix,{compilerOptions}).outputText,{props,installPortalLocale:store.install});
}

/** Exercise the production selection/disposal closures, with state setters observed. */
function languageSelection(name:'Portal'|'AdminControlCenter',store:Store){
  const {source}=component(name);
  let change:ts.FunctionDeclaration|undefined,cleanup:ts.ExpressionStatement|undefined;
  function visit(node:ts.Node){
    if(ts.isFunctionDeclaration(node)&&node.name?.text==='loadLanguage')change=node;
    if(ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(source)==='onCleanup'&&node.getText(source).includes('languageDisposed'))cleanup=node;
    ts.forEachChild(node,visit);
  }
  visit(source);
  if(!change||!cleanup)throw Error('Missing language selection lifecycle');
  const state={locale:'de' as Locale,busy:false,error:''};
  const setLanguage=(locale:Locale)=>{state.locale=locale;};
  const setError=(error:string)=>{state.error=error;};
  let dispose=()=>{};
  const exposed:{}&{change?:(locale:Locale)=>Promise<boolean>}={};
  const text='let languageAttempt=0,languageDisposed=false;\n'+change.getText(source)+'\n'+cleanup.getText(source)+'\nexports.change=loadLanguage;';
  runInNewContext(ts.transpileModule(text,{compilerOptions}).outputText,{
    exports:exposed,ensurePortalLocale:store.ensure,portalMessages:store.portalMessages,
    language:()=>state.locale,t:()=>store.portalMessages[state.locale],
    setLanguage,setLocale:setLanguage,setLanguageBusy:(busy:boolean)=>{state.busy=busy;},setLanguageError:setError,setError,
    onCleanup:(callback:()=>void)=>{dispose=callback;},
  });
  return {state,change:exposed.change!,dispose:()=>dispose()};
}

function deferred<T>(){
  let resolve!:(value:T)=>void,reject!:(error:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

describe('workspace selected-language payload',()=>{
  it('keeps every dictionary out of executable client code, including the default language',async()=>{
    const result=await build({entryPoints:['src/lib/portal-locale-data.ts'],bundle:true,write:false,format:'esm',platform:'browser',minify:true,charset:'utf8',logLevel:'silent',define:{'import.meta.env.SSR':'false'},plugins:[{
      name:'static-language-asset-urls',setup(plugin){
        plugin.onResolve({filter:/\?url(?:&no-inline)?$/},args=>({path:args.path,namespace:'asset-url'}));
        plugin.onLoad({filter:/.*/,namespace:'asset-url'},args=>({contents:'export default '+JSON.stringify('/_astro/'+basename(args.path.split('?')[0])),loader:'js'}));
      },
    }]});
    const code=result.outputFiles[0].text;
    for(const value of Object.values(packs)){
      expect(code).not.toContain(value.portal.ownerGuide);
      expect(code).not.toContain(value.workspace.entryIntro);
      expect(code).not.toContain(value.admin.operationsText);
    }
    expect(code).not.toContain('data:application/json');
  });

  it.each(['de','en','pl','lt','ru','uk'] as const)('can bootstrap only %s synchronously without fetching German or any other language',async locale=>{
    const load=vi.fn(async(next:Locale)=>pack(next));
    const store=createPortalLocaleStore(undefined,load);
    expect(Object.keys(store.portalMessages)).toEqual([]);
    store.install(pack(locale),locale);
    expect(Object.keys(store.portalMessages)).toEqual([locale]);
    expect(store.workspaceWords[locale]).toEqual(packs[locale].workspace);
    expect(store.adminWords[locale]).toEqual(packs[locale].admin);
    expect(store.cabinetWords[locale]).toEqual(packs[locale].cabinet);
    await store.ensure(locale);
    expect(load).not.toHaveBeenCalled();
  });

  it.each([['Portal','de'],['Portal','ru'],['AdminControlCenter','de']] as const)('%s seeds its %s SSR labels before the first component read', (name,locale)=>{
    const store=createPortalLocaleStore(undefined,vi.fn());
    bootstrap(name,{locale,initialLocalePack:pack(locale)},store);
    expect(store.portalMessages[locale]).toEqual(packs[locale].portal);
    expect(store.workspaceWords[locale]).toEqual(packs[locale].workspace);
    expect(store.adminWords[locale]).toEqual(packs[locale].admin);
    expect(store.cabinetWords[locale]).toEqual(packs[locale].cabinet);
    expect(Object.keys(store.portalMessages)).toEqual([locale]);
  });

  it('keeps the embedded Portal on the already selected parent language',async()=>{
    const load=vi.fn(async(locale:Locale)=>pack(locale));
    const store=createPortalLocaleStore(undefined,load);
    bootstrap('AdminControlCenter',{initialLocalePack:pack('de')},store);
    await store.ensure('uk');
    const selected=store.portalMessages.uk;
    bootstrap('Portal',{locale:'uk',embedded:true},store);
    expect(store.portalMessages.uk).toBe(selected);
    expect(store.workspaceWords.uk).toEqual(uk.workspace);
    expect(load.mock.calls).toEqual([['uk']]);
  });

  it('rejects an incomplete initial pack before publishing any section and allows a valid retry',()=>{
    const store=createPortalLocaleStore(undefined,vi.fn());
    const invalid=structuredClone(ru);delete (invalid.cabinet as Partial<typeof invalid.cabinet>).loaded;
    expect(()=>store.install(invalid,'ru')).toThrow();
    for(const values of [store.portalMessages,store.workspaceWords,store.adminWords,store.cabinetWords])expect(Object.keys(values)).toEqual([]);
    expect(()=>store.install(ru,'de')).toThrow();
    store.install(ru,'ru');expect(store.cabinetWords.ru.loaded).toBe(ru.cabinet.loaded);
  });

  it('passes exactly the page language at all three Astro hydration boundaries',()=>{
    for(const [path,locale] of [['konto.astro','de'],['ru/konto.astro','ru'],['admin.astro','de']]){
      const source=readFileSync(new URL('../src/pages/'+path,import.meta.url),'utf8');
      expect(source.match(/portal-locales\/[a-z]+\.json/g)).toEqual([`portal-locales/${locale}.json`]);
      expect(source).toContain('initialLocalePack={initialLocalePack}');
    }
  });
});

describe.each(['Portal','AdminControlCenter'] as const)('%s language race and lifecycle',name=>{
  it('keeps the latest selection and all four matching label sections when responses arrive out of order',async()=>{
    const slow=deferred<PortalLocalePack>(),fast=deferred<PortalLocalePack>();
    const store=createPortalLocaleStore(pack('de'),locale=>locale==='pl'?slow.promise:fast.promise);
    const ui=languageSelection(name,store);
    const first=ui.change('pl'),last=ui.change('uk');
    expect(ui.state.busy).toBe(true);
    fast.resolve(pack('uk'));expect(await last).toBe(true);
    slow.resolve(pack('pl'));expect(await first).toBe(false);
    expect(ui.state).toEqual({locale:'uk',busy:false,error:''});
    for(const [actual,expected] of [[store.portalMessages,uk.portal],[store.workspaceWords,uk.workspace],[store.adminWords,uk.admin],[store.cabinetWords,uk.cabinet]] as const)expect(actual[ui.state.locale]).toEqual(expected);
  });

  it('does not show a stale failure after a newer language has succeeded',async()=>{
    const slow=deferred<PortalLocalePack>();
    const store=createPortalLocaleStore(pack('de'),locale=>locale==='pl'?slow.promise:Promise.resolve(pack(locale)));
    const ui=languageSelection(name,store);
    const first=ui.change('pl');await ui.change('lt');
    slow.reject(Error('offline'));expect(await first).toBe(false);
    expect(ui.state).toEqual({locale:'lt',busy:false,error:''});
    expect(Object.hasOwn(store.portalMessages,'pl')).toBe(false);
    expect(store.portalMessages.lt).toEqual(lt.portal);
  });

  it('ignores late completion after the component is disposed',async()=>{
    const pending=deferred<PortalLocalePack>();
    const store=createPortalLocaleStore(pack('de'),()=>pending.promise);
    const ui=languageSelection(name,store);
    const result=ui.change('en');ui.dispose();pending.resolve(pack('en'));
    expect(await result).toBe(false);expect(ui.state.locale).toBe('de');expect(ui.state.error).toBe('');
  });
});
