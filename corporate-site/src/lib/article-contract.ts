/** Bounded, plain-text knowledge articles share the existing owner Studio ledger. */
export type ArticleContent=Readonly<{title:string;description:string;body:string}>;
export type ArticleLocation=Readonly<{path:string;slug:string;locale:'de'|'en'|'uk'|'ru'}>;
export class ArticleInputError extends Error {
  constructor(message:string){super(message);this.name='ArticleInputError';}
}
const pattern=/^\/(?:(en|uk|ru)\/)?wissen\/([a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?)\/$/;
const plain=(value:unknown,max:number):string=>{
  if(typeof value!=='string'||value.length>max||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
    throw new ArticleInputError('Nur begrenzter Klartext ohne HTML oder Steuercodes ist erlaubt.');
  return value.trim();
};
export function parseArticlePath(value:unknown):ArticleLocation|null{
  if(typeof value!=='string'||value.length>96)return null;
  const match=pattern.exec(value);
  return match?{path:value,locale:(match[1]||'de') as ArticleLocation['locale'],slug:match[2]}:null;
}
export function validateArticleContent(value:unknown,forPublication=false):ArticleContent{
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='body,description,title')
    throw new ArticleInputError('Titel, Beschreibung und Inhalt sind erforderlich.');
  const fields=value as Record<string,unknown>;
  const title=plain(fields.title,100),description=plain(fields.description,250),body=plain(fields.body,6000);
  if(forPublication&&(title.length<10||description.length<50||body.length<180))
    throw new ArticleInputError('Zum Veröffentlichen: Titel 10, Beschreibung 50, Inhalt 180 Zeichen.');
  return {title,description,body};
}
export function publishedArticle(row:{published_version?:unknown;published_json?:unknown}|null|undefined):ArticleContent|null{
  if(!row||!Number.isSafeInteger(Number(row.published_version))||Number(row.published_version)<1||
    typeof row.published_json!=='string'||row.published_json.length>20000)return null;
  try{return validateArticleContent(JSON.parse(row.published_json),true);}catch{return null;}
}
