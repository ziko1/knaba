import {constructionOffers} from '../data/construction-offers';
import {constructionGuides} from '../data/construction-guides';

export type StudioPageOption = {path:string;title:string};
/** Published Astro public pages only; never include owner/CRM/legal/retired office URLs. */
const common=[
  {path:'/',title:'Home'},
  {path:'/leistungen/',title:'Bauleistungen'},
  {path:'/branchen/',title:'B2B Branchen'},
  {path:'/unternehmen/',title:'Unternehmen'},
  {path:'/galerie/',title:'Galerie'},
  {path:'/karriere/',title:'Karriere'},
  {path:'/kontakt/',title:'Kontakt'},
  {path:'/planer/',title:'Planer'},
  {path:'/berlin/',title:'Berlin & Brandenburg'},
  {path:'/ratgeber/',title:'Ratgeber'},
  {path:'/faq/',title:'FAQ · Baureinigung'},
] as const;
const locales=[{prefix:'',name:'DE'},{prefix:'/en',name:'EN'},{prefix:'/uk',name:'UK'},{prefix:'/ru',name:'RU'}] as const;
export const studioPages: readonly StudioPageOption[] = Object.freeze(
  locales.flatMap(({prefix,name})=>[
    ...common.map(item=>({path:prefix+item.path,title:name+' · '+item.title})),
    ...constructionOffers.map(item=>({path:prefix+'/bauleistungen/'+item.slug+'/',title:name+' · '+item.name.de})),
    ...constructionGuides.map(item=>({path:prefix+'/ratgeber/'+item.slug+'/',title:name+' · '+item.title.de}))
  ])
);
