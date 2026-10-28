import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PUBLISHED_SITE_LOCALES} from '../src/lib/locale-catalog';

const root=new URL('../',import.meta.url);
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

describe('localized raster share cards preserve the existing approved brand',()=>{
  it('ships four distinct valid 1200×630 PNGs with recorded SVG source identity',async()=>{
    const {default:sharp}=await import('sharp');
    const receipt=JSON.parse(readFileSync(new URL('docs/evidence/requirements-followup-20261028/social-assets.json',root),'utf8'));
    expect(receipt.locales.map((entry:{locale:string})=>entry.locale)).toEqual([...PUBLISHED_SITE_LOCALES]);
    const outputs=new Set<string>();
    for(const locale of PUBLISHED_SITE_LOCALES){
      const suffix=locale==='de'?'':'-'+locale;
      const source=readFileSync(new URL(`public/images/knaba-3d-header${suffix}.svg`,root));
      const image=readFileSync(new URL(`public/images/knaba-social-${locale}.png`,root));
      expect(image.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
      expect(image.toString('ascii',12,16)).toBe('IHDR');
      expect(image.readUInt32BE(16)).toBe(1200);
      expect(image.readUInt32BE(20)).toBe(630);
      expect(image.length).toBeGreaterThan(5000);
      expect(image.length).toBeLessThan(200*1024);
      const decoded=await sharp(image).stats();
      expect(decoded.isOpaque).toBe(true);
      expect(decoded.channels.some(channel=>channel.max-channel.min>200)).toBe(true);
      const entry=receipt.locales.find((item:{locale:string})=>item.locale===locale);
      expect(entry.sourceSha256).toBe(digest(source));
      expect(entry.imageSha256).toBe(digest(image));
      outputs.add(digest(image));
    }
    expect(outputs.size).toBe(PUBLISHED_SITE_LOCALES.length);
  });
});
