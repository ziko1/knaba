import {describe,it,expect} from 'vitest';
import {resolve} from 'node:path';
import {listStudioMedia} from '../src/lib/studio-media';
import {validateStudioEntries} from '../src/lib/site-studio-contract';

describe('KNABA Studio bundled public media picker',()=>{
  it('offers only existing safe local images that satisfy Studio src validation',()=>{
    const assets=listStudioMedia(resolve(process.cwd(),'public'));
    expect(assets.length).toBeGreaterThan(3);
    expect(new Set(assets).size).toBe(assets.length);
    expect(assets).toContain('/illustrations/baureinigung.svg');
    for(const value of assets){
      expect(value).toMatch(/^\/(images|illustrations)\/[a-z0-9_-]+\.(svg|png|jpg|jpeg|webp|avif)$/);
      expect(validateStudioEntries([{selector:'#main > img:nth-of-type(1)',kind:'src',value}])).toHaveLength(1);
    }
  });
  it('never leaks secrets, subdirectories or file names outside the image allowlist',()=>{
    const assets=listStudioMedia(resolve(process.cwd(),'public'));
    expect(assets.every(x=>!x.includes('..')&&!x.includes('//'))).toBe(true);
  });
});
