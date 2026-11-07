import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createTemplateMutations,TemplateRequestError,validateTemplateState} from '../src/scripts/site-templates';

const hash='a'.repeat(64);
const initial={version:0,activeDigest:null,draftDigest:null,templates:[{digest:hash,name:'KnaBa Original',version:'1.0.0',author:'KnaBa',license:'Project assets',builtin:true}],history:[]};
describe('template manager loss-safe request state',()=>{
  it('retries the original serialized action and idempotency key after an uncertain response',async()=>{
    const calls:{path:string;payload:string}[]=[];
    const client=createTemplateMutations(async(path,payload)=>{calls.push({path,payload});if(calls.length===1)throw new TypeError('network failed');return initial;});
    const body={digest:hash,version:3,confirm:'PUBLISH',idempotencyKey:'same-request-123456'};
    await expect(client.run('/activate',body)).rejects.toThrow();
    body.version=99;
    expect(client.snapshot().pending).not.toBeNull();
    await expect(client.run('/rollback',{version:99})).rejects.toThrow();
    expect(await client.retry()).toEqual(initial);
    expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
    expect(JSON.parse(calls[1].payload).version).toBe(3);
    expect(client.snapshot()).toEqual({pending:null,running:false});
  });
  it('does not dispatch a second action or retry while the first request is running',async()=>{
    let resolve!:(value:unknown)=>void,calls=0;
    const response=new Promise<unknown>(yes=>{resolve=yes;});
    const client=createTemplateMutations(async()=>{calls++;return response;});
    const first=client.run('/select',{digest:hash,version:0});
    await expect(client.retry()).rejects.toThrow();
    await expect(client.run('/activate',{digest:hash,version:0})).rejects.toThrow();
    expect(calls).toBe(1);resolve(initial);await first;
    expect(client.snapshot().pending).toBeNull();
  });
  it.each([400,401,403,409,413,422,429])('clears a definitively rejected %s request so refreshed state can be reviewed',async status=>{
    const client=createTemplateMutations(async()=>{throw new TemplateRequestError(status);});
    await expect(client.run('/select',{digest:hash,version:0})).rejects.toThrow();
    expect(client.snapshot()).toEqual({pending:null,running:false});
    await expect(client.retry()).rejects.toThrow();
  });
  it.each([0,500,502,503])('retains the original request after ambiguous status %s',async status=>{
    const client=createTemplateMutations(async()=>{throw new TemplateRequestError(status);});
    await expect(client.run('/activate',{digest:hash,version:0,idempotencyKey:'key'})).rejects.toThrow();
    expect(client.snapshot().pending?.path).toBe('/activate');
    expect(client.snapshot().running).toBe(false);
  });
  it('rejects malformed state rather than exposing controls for an unknown revision',()=>{
    expect(validateTemplateState(initial)).toEqual(initial);
    for(const state of [null,{}, {...initial,version:-1},{...initial,version:0.5},{...initial,activeDigest:'../../etc'},{...initial,templates:[{...initial.templates[0],digest:'bad'}]},{...initial,history:[{revision:'1',digest:hash,action:'publish',createdAt:'now'}]}])expect(()=>validateTemplateState(state)).toThrow();
  });
  it('ships all six complete plain-text language packs',()=>{
    const packs=['de','en','pl','lt','ru','uk'].map(language=>JSON.parse(readFileSync(new URL('../src/data/template-locales/template-'+language+'.json',import.meta.url),'utf8')) as Record<string,string>);
    for(const pack of packs){
      expect(Object.keys(pack).sort()).toEqual(Object.keys(packs[0]).sort());
      for(const text of Object.values(pack)){expect(typeof text).toBe('string');expect(text.trim()).not.toBe('');expect(text).not.toMatch(/[<>]/);}
      expect(pack.format).toContain('64 KiB');expect(pack.format).toContain('template.json');expect(pack.format).toContain('LICENSE.txt');
    }
  });
  it('keeps the preview scriptless and denies referrer disclosure',()=>{
    const source=readFileSync(new URL('../src/pages/studio/templates.astro',import.meta.url),'utf8');
    const frames=source.match(/<iframe\b[^>]*>/g)||[];
    expect(frames).toHaveLength(1);expect(frames[0]).toMatch(/sandbox=""/);expect(frames[0]).toMatch(/referrerpolicy="no-referrer"/);
    expect(frames[0]).not.toContain('allow-same-origin');expect(frames[0]).not.toContain('allow-scripts');
  });
});
