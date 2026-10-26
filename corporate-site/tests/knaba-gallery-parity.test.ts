import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
describe('KNABA licensed-source gallery and navigation',()=>{
  it('reuses exactly one Astro component for DE/EN/UK/RU routes',()=>{
    const c=read('../src/components/ConstructionGallery.astro');
    const paths={
      de:'../src/pages/galerie.astro',
      en:'../src/pages/en/galerie.astro',
      uk:'../src/pages/uk/galerie.astro',
      ru:'../src/pages/ru/galerie.astro'
    };
    for(const [lang,path] of Object.entries(paths)){
      expect(read(path)).toContain('ConstructionGallery.astro');
      expect(read(path)).toContain('locale="'+lang+'"');
    }
    expect(c).toContain('aria-labelledby="knaba-gallery-title"');
    expect(c).toContain('width="960" height="640"');
    expect(c).toContain('loading="lazy"');
    expect(c).toContain("prefix+'/kontakt/'");
  });
  it('uses existing first-party SVG art and describes it as illustrative',()=>{
    const c=read('../src/components/ConstructionGallery.astro');
    for(const asset of ['baureinigung.svg','hero-cleaning.svg','glasreinigung.svg','treppenreinigung.svg']){
      expect(c).toContain('/illustrations/'+asset);
      expect(read('../public/illustrations/'+asset)).toContain('<svg');
    }
    expect(c).not.toContain('https://knaba.de/');
    for(const marker of ['Illustrative Darstellungen','Original illustrations','схематичні ілюстрації','схематические иллюстрации'])expect(c).toContain(marker);
  });
  it('keeps the gallery inside existing navigation and protects users from research URLs',()=>{
    const layout=read('../src/layouts/Layout.astro');
    expect(layout).toContain('["/galerie/", "Galerie"]');
    expect(layout).toContain('localPath("/galerie/")');
    expect(read('../src/pages/impressum.astro')).not.toContain('Stand des Quellenabgleichs');
    expect(read('../src/pages/ru/impressum.astro')).not.toContain('Дата сверки с источником');
    expect(read('../src/pages/datenschutz.astro')).toContain('impro.usercontent.one');
    expect(read('../src/pages/ru/datenschutz.astro')).toContain('impro.usercontent.one');
  });
});
