import {describe,it,expect,vi} from 'vitest';
import de from '../src/data/portal-locales/de.json';
import en from '../src/data/portal-locales/en.json';
import pl from '../src/data/portal-locales/pl.json';
import lt from '../src/data/portal-locales/lt.json';
import ru from '../src/data/portal-locales/ru.json';
import uk from '../src/data/portal-locales/uk.json';
import {createPortalLocaleStore,validatePortalLocalePack,type PortalLocalePack} from '../src/lib/portal-locale-store';
const packs={de,en,pl,lt,ru,uk} as const;
const baseline=de as PortalLocalePack;

describe('portal language data loading',()=>{
  it('keeps complete text-key parity for all six explicit language packs',()=>{
    for(const [locale,pack] of Object.entries(packs))expect(validatePortalLocalePack(pack,locale as keyof typeof packs,baseline)).toBe(pack);
  });
  it('starts in German and requests only the selected language once',async()=>{
    const load=vi.fn(async(locale:keyof typeof packs)=>packs[locale]);
    const store=createPortalLocaleStore(baseline,load);
    expect(Object.keys(store.portalMessages)).toEqual(['de']);
    await store.ensure('de');expect(load).not.toHaveBeenCalled();
    await Promise.all([store.ensure('pl'),store.ensure('pl')]);
    expect(load).toHaveBeenCalledTimes(1);expect(load).toHaveBeenCalledWith('pl');
    expect(Object.keys(store.portalMessages)).toEqual(['de','pl']);
    expect(store.portalMessages.pl.portal).toBe(pl.portal.portal);
    expect(store.workspaceWords.pl.conversations).toBe(pl.workspace.conversations);
    expect(store.adminWords.pl.title).toBe(pl.admin.title);
    expect(store.cabinetWords.pl.agenda).toBe(pl.cabinet.agenda);
    expect(Object.keys(store.cabinetWords)).toEqual(['de','pl']);
    await store.ensure('pl');expect(load).toHaveBeenCalledTimes(1);
  });
  it('preserves existing copy and permits retry after network failure',async()=>{
    const load=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(lt);
    const store=createPortalLocaleStore(baseline,load),before=store.portalMessages.de;
    await expect(store.ensure('lt')).rejects.toThrow('offline');
    expect(store.portalMessages.de).toBe(before);expect(Object.hasOwn(store.portalMessages,'lt')).toBe(false);
    await store.ensure('lt');expect(store.portalMessages.lt.portal).toBe(lt.portal.portal);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('rejects wrong, incomplete and invalid data before publishing a locale',async()=>{
    const broken=structuredClone(pl);delete (broken.portal as Partial<typeof broken.portal>).loading;
    for(const invalid of [en,broken,{...pl,workspace:{...pl.workspace,send:''}},{...pl,cabinet:{...pl.cabinet,loaded:''}},{...pl,cabinet:null},{...pl,portal:[]},null]){
      const store=createPortalLocaleStore(baseline,async()=>invalid);
      await expect(store.ensure('pl')).rejects.toThrow();
      expect(Object.keys(store.portalMessages)).toEqual(['de']);
      expect(Object.keys(store.workspaceWords)).toEqual(['de']);
      expect(Object.keys(store.cabinetWords)).toEqual(['de']);
    }
  });
});
