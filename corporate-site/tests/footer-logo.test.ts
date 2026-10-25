import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const layout=read('../src/layouts/Layout.astro'),css=read('../src/styles/global.css');
const header=read('../public/images/knaba-3d-header.svg');
const footer=read('../public/images/knaba-3d-footer.svg');
const mobileHeader=read('../public/images/knaba-3d-mobile-header.svg');
const mobileFooter=read('../public/images/knaba-3d-mobile-footer.svg');
describe('KNABA approved 3D logo on all shared locale routes',()=>{
 it('connects one desktop and one mobile 3D source per surface',()=>{
   for(const name of ['knaba-3d-header.svg','knaba-3d-footer.svg','knaba-3d-mobile-header.svg','knaba-3d-mobile-footer.svg']){
     expect(layout.split('/images/'+name).length-1).toBe(1);
   }
   expect(layout.match(/<picture class="knaba-3d-media">/g)).toHaveLength(2);
   expect(layout.split('media="(max-width: 700px)"').length-1).toBe(2);
   expect(layout).toContain('class="brand footer-brand construction-brand"');
   expect(layout).toContain('alt={brandAlt}');
   expect(layout.match(/aria-label=\{brandAlt\}/g)).toHaveLength(2);
   for(const locale of ['de:','en:','uk:','ru:'])expect(layout).toContain(locale);
 });
 it('uses transparent first-party assets with correct teal, site-lime accent and unchanged slogan',()=>{
   for(const svg of [header,footer,mobileHeader,mobileFooter]){
     expect(svg).toContain('<title id="knaba-title">KNABA</title>');
     expect(svg).toContain('Drei geometrische Bauwerke');
     expect(svg).toContain('#13B8B4');
     expect(svg).toContain('#D8F779');
     expect(svg).toContain('fill="url(#limeAccent)"');
     expect(svg).toContain('fill="url(#limeBase)"');
     expect(svg).not.toContain('#FDBE38');
     for(const forbidden of ['<script','<foreignObject','href="http','src="http','fill="#FBFCF7"','fill="#102E36"'])expect(svg).not.toContain(forbidden);
     expect(Buffer.byteLength(svg)).toBeLessThan(15000);
   }
   expect(header).toContain('viewBox="0 0 1140 350"');
   expect(footer).toContain('fill="#F6FFFA">Unser Ziel ist Ihre Wertschöpfung');
   expect(header).toContain('fill="#102F38">Unser Ziel ist Ihre Wertschöpfung');
   expect(mobileHeader).toContain('viewBox="0 0 1140 280"');
   expect(mobileFooter).not.toContain('Unser Ziel ist Ihre Wertschöpfung');
 });
 it('keeps keyboard focus, responsive proportions and transparent footer',()=>{
   expect(css).toContain('.footer-brand.construction-brand{background:transparent;');
   expect(css).toContain('.footer-brand.construction-brand:focus-visible');
   expect(css).toContain('.knaba-3d-media');
   expect(css).toContain('aspect-ratio:1140/280');
 });
});
