import {constructionOffers} from '../data/construction-offers';

export type StudioPageOption = {path:string;title:string};
/** Published Astro public pages only; never include owner/CRM/legal/retired office URLs. */
const common=[
  {path:'/',title:'Home'},
  {path:'/leistungen/',title:'Bauleistungen'},
  {path:'/branchen/',title:'B2B Branchen'},
  {path:'/unternehmen/',title:'Unternehmen'},
  {path:'/karriere/',title:'Karriere'},
  {path:'/kontakt/',title:'Kontakt'},
  {path:'/planer/',title:'Planer'},
  {path:'/berlin/',title:'Berlin & Brandenburg'},
  {path:'/ratgeber/',title:'Ratgeber'},
] as const;
const locales=[{prefix:'',name:'DE'},{prefix:'/en',name:'EN'},{prefix:'/uk',name:'UK'},{prefix:'/ru',name:'RU'}] as const;
export const studioPages: readonly StudioPageOption[] = Object.freeze(
  locales.flatMap(({prefix,name})=>[
    ...common.map(item=>({path:prefix+item.path,title:name+' · '+item.title})),
    ...constructionOffers.map(item=>({path:prefix+'/bauleistungen/'+item.slug+'/',title:name+' · '+item.name.de}))
  ])
);
