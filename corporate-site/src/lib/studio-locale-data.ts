// Content-addressed static text assets; no executable code is stored in JSON.
import de from '../data/studio-locales/studio-de.json?url';
import en from '../data/studio-locales/studio-en.json?url';
import uk from '../data/studio-locales/studio-uk.json?url';
import ru from '../data/studio-locales/studio-ru.json?url';
import {createStudioLocaleStore} from './studio-locale-store';
const urls={de,en,uk,ru};
export const studioLocaleStore=createStudioLocaleStore(async locale=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(urls[locale],{credentials:'omit',cache:'force-cache',signal:controller.signal});
    if(!response.ok)throw Error('Studio language pack unavailable');
    const source=await response.text();
    if(source.length>64000)throw Error('Studio language pack is too large');
    return JSON.parse(source) as unknown;
  }finally{clearTimeout(timer);}
});
