import {it, expect} from 'vitest';
import {build} from 'esbuild';
import {parse, compileScript} from '@vue/compiler-sfc';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

it('renders and updates the real ServiceFinder with the production composition runtime', async () => {
  const directory=await mkdtemp(join(tmpdir(),'knaba-vue-runtime-'));
  try {
    const outfile=join(directory,'smoke.mjs');
    await build({
      stdin:{resolveDir:resolve('.'),sourcefile:'composition-smoke.mjs',contents:`
        import assert from 'node:assert/strict';
        import {createRenderer,h,nextTick} from 'vue';
        import Finder from './src/components/ServiceFinder.vue';
        import configure from './src/vue-app';
        import {plannerStore} from './src/stores/planner';
        const element=tag=>({tag,props:{},children:[],parent:null,text:''});
        const detach=node=>{if(node.parent){const siblings=node.parent.children;const at=siblings.indexOf(node);if(at>=0)siblings.splice(at,1);node.parent=null;}};
        const renderer=createRenderer({
          createElement:element,createText:text=>({...element('#text'),text}),createComment:text=>({...element('#comment'),text}),
          insert(node,parent,anchor){detach(node);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},
          remove:detach,setElementText(node,text){node.children=[];node.text=text;},setText(node,text){node.text=text;},
          parentNode:node=>node.parent,nextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1]??null,
          patchProp(node,key,previous,value){node.props[key]=value;},setScopeId(){},
        });
        const walk=node=>[node,...node.children.flatMap(walk)];
        const text=node=>node.text+node.children.map(text).join('');
        const root=element('root');
        // Match Astro's render-host wrapper, with the real Pinia app entrypoint.
        const app=renderer.createApp({render(){return h(Finder,{locale:'en'});}});
        configure(app);app.mount(root);await nextTick();
        const fieldsets=walk(root).filter(node=>node.tag==='fieldset');
        assert.equal(fieldsets.length,2);
        const choices=walk(fieldsets[1]).filter(node=>node.tag==='button');
        assert.equal(choices.length,4);
        const recommendation=()=>walk(root).find(node=>node.props.class==='recommendation');
        const initial=text(recommendation());
        choices[2].props.onClick();await nextTick();
        assert.equal(choices[2].props['aria-pressed'],true);
        assert.notEqual(text(recommendation()),initial);
        const choose=walk(recommendation()).find(node=>node.tag==='button');
        choose.props.onClick();await nextTick();
        assert.equal(plannerStore.getState().topic,'baustellenraeumung');
        assert.ok(text(choose).includes('✓'));
        app.unmount();assert.equal(root.children.length,0);
        console.log('production Finder render, Pinia events, shared selection and unmount passed');
      `},
      outfile,bundle:true,format:'esm',platform:'node',target:'node24',minify:true,
      alias:{vue:'vue/dist/vue.runtime.esm-bundler.js'},
      define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'false',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},
      plugins:[{name:'compile-real-vue-component',setup(bundler){
        bundler.onLoad({filter:/\.vue$/},async({path})=>{
          const {descriptor,errors}=parse(await readFile(path,'utf8'),{filename:path});
          if(errors.length)throw errors[0];
          const compiled=compileScript(descriptor,{id:'finder-smoke',isProd:true,inlineTemplate:true});
          return {contents:compiled.content,loader:'ts',resolveDir:resolve(path,'..')};
        });
      }}],
    });
    expect(execFileSync(process.execPath,[outfile],{encoding:'utf8',timeout:10000})).toContain('production Finder render, Pinia events, shared selection and unmount passed');
  } finally { await rm(directory,{recursive:true,force:true}); }
},20000);
