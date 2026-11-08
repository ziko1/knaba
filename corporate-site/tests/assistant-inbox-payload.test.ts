import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {basename} from 'node:path';
import {build} from 'esbuild';
import ts from 'typescript';
import {canAccessAdminModule} from '../src/lib/admin-access';
import {inboxPacks} from './helpers/assistant-inbox-packs';

type Node={type:string;props:Record<string,unknown>;children:Node[]};
const h=(type:string,props:Record<string,unknown>,...children:Node[])=>({type,props:props??{},children});
function adminMessagesMount(role='owner'){
  // Evaluate the actual parent JSX adapter and the actual lazy outlet. Rendering
  // primitives are replaced; auth selection and forwarded props are production code.
  const parent=ts.createSourceFile('AdminControlCenter.tsx',readFileSync(new URL('../src/components/AdminControlCenter.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let mount:ts.JsxSelfClosingElement|undefined;
  function find(node:ts.Node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(parent)==='AdminModuleOutlet')mount=node;ts.forEachChild(node,find);}
  find(parent);if(!mount)throw Error('Missing admin module mount');
  const passed:{node?:Node}={};
  const options={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'h'};
  runInNewContext(ts.transpileModule('exports.node='+mount.getText(parent),{compilerOptions:options}).outputText,{
    exports:passed,h,AdminModuleOutlet:'AdminModuleOutlet',module:{id:'messages'},props:{initialInboxLabels:inboxPacks.de},role:()=>role,language:()=> 'de',selected:()=> 'messages',testing:()=>false,
  });
  const source=ts.createSourceFile('AdminModuleOutlet.tsx',readFileSync(new URL('../src/components/AdminModuleOutlet.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const component=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='AdminModuleOutlet');
  if(!component)throw Error('Missing admin module adapter');
  const exposed:{default?:(props:Record<string,unknown>)=>Node}={};
  runInNewContext(ts.transpileModule(component.getText(source),{compilerOptions:options}).outputText,{
    exports:exposed,h,canAccessAdminModule,Show:'Show',Switch:'Switch',Match:'Match',Portal:'Portal',CrmConsole:'CrmConsole',AssistantInbox:'AssistantInbox',SiteStudio:'SiteStudio',
  });
  function render(node:Node):Node|null{
    if(node.type==='Show'||node.type==='Match')return node.props.when?render(node.children[0]):null;
    if(node.type==='Switch')return node.children.map(render).find(Boolean)??null;
    return node;
  }
  return render(exposed.default!(passed.node!.props));
}

describe('Assistant inbox locale payload boundary',()=>{
  it('keeps all six dictionaries out of the client locale bundle',async()=>{
    const result=await build({entryPoints:['src/lib/assistant-inbox-i18n.ts'],bundle:true,write:false,format:'esm',platform:'browser',minify:true,charset:'utf8',logLevel:'silent',plugins:[{
      name:'static-asset-urls',setup(plugin){
        plugin.onResolve({filter:/\?url&no-inline$/},args=>({path:args.path,namespace:'asset-url'}));
        plugin.onLoad({filter:/.*/,namespace:'asset-url'},args=>({contents:'export default '+JSON.stringify('/_astro/'+basename(args.path.split('?')[0])),loader:'js'}));
      },
    }]});
    const code=result.outputFiles[0].text;
    for(const pack of Object.values(inboxPacks))expect(code).not.toContain(pack.confirmRevoke);
    expect(code).not.toContain('data:application/json');
  });

  it('forwards initial page labels through the protected lazy admin messages entry',()=>{
    const node=adminMessagesMount();
    expect(node?.type).toBe('AssistantInbox');
    expect(node?.props.initialLabels).toEqual(inboxPacks.de);
    expect(node?.props.initialLocale).toBe('de');
    expect(adminMessagesMount('admin')).toBeNull();
    expect(adminMessagesMount('anonymous')).toBeNull();
  });

  it('supplies only the initial page language at all three Astro entry points',()=>{
    for(const [path,locale,prop] of [
      ['../src/pages/postfach.astro','de','initialLabels'],
      ['../src/pages/ru/postfach.astro','ru','initialLabels'],
      ['../src/pages/admin.astro','de','initialInboxLabels'],
    ]){
      const source=readFileSync(new URL(path,import.meta.url),'utf8');
      expect(source.match(/assistant-inbox-locales\/inbox-[a-z]+\.json/g)).toEqual([`assistant-inbox-locales/inbox-${locale}.json`]);
      expect(source).toContain(prop+'={initialInboxLabels}');
    }
  });
});
