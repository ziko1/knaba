import {parseArticlePath,publishedArticle} from '../src/lib/article-contract.ts';
export {parseArticlePath,publishedArticle} from '../src/lib/article-contract.ts';

/** VPS-only public HTML. No raw markup or executable user input is accepted. */
const esc=(s)=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#39;');
const locales=['de','en','uk','ru'];
const copy={
  de:{section:'Wissen aus der Praxis',lead:'Weitere Hinweise rund um Bauprojekte',back:'Alle Ratgeber',contact:'Projekt anfragen'},
  en:{section:'Practical construction knowledge',lead:'More guidance for construction projects',back:'All guides',contact:'Request a project quote'},
  uk:{section:'Практичні поради для будівництва',lead:'Більше порад для будівельних проєктів',back:'Усі поради',contact:'Надіслати запит'},
  ru:{section:'Практические советы для строительства',lead:'Дополнительные материалы для строительных проектов',back:'Все советы',contact:'Отправить запрос'}
};
const prefix=(lang)=>lang==='de'?'':'/'+lang;
const replaceOne=(source,pattern,replacement)=>{
  let count=0;
  const next=source.replace(pattern,()=>{count++;return replacement;});
  return count===1?next:null;
};
/** One bounded indexed DB query per dynamic render; no untrusted path resolution. */
export function listPublishedArticles(db){
  const rows=db.prepare("SELECT page_path,published_json,published_version FROM studio_pages WHERE published_version>0 AND page_path LIKE '%/wissen/%' ORDER BY page_path LIMIT 201").all();
  if(rows.length>200)return [];
  return rows.flatMap(row=>{
    const location=parseArticlePath(row.page_path),article=publishedArticle(row);
    return location&&article?[{...location,...article}]:[];
  });
}
function articleLinks(article,all,origin){
  const siblings=all.filter(item=>item.slug===article.slug);
  const links=locales.flatMap(lang=>{
    const match=siblings.find(x=>x.locale===lang);
    return match?[{lang,url:origin+match.path}]:[];
  });
  const german=siblings.find(x=>x.locale==='de');
  if(german)links.push({lang:'x-default',url:origin+german.path});
  return links;
}
const linkHtml=(items)=>items.map(l=>'<link rel="alternate" hreflang="'+esc(l.lang)+'" href="'+esc(l.url)+'">').join('');
const linkXml=(items)=>items.map(l=>'<xhtml:link rel="alternate" hreflang="'+esc(l.lang)+'" href="'+esc(l.url)+'" />').join('');
const paragraph=(s)=>esc(s.trim().replace(/\n/g,' '));
function articleBlocks(body){
  return body.split(/\n[ \t]*\n/g).map(part=>{
    const trimmed=part.trim();
    if(!trimmed)return '';
    if(trimmed.startsWith('## ')&&trimmed.length>3)return '<h2>'+paragraph(trimmed.slice(3))+'</h2>';
    return '<p>'+paragraph(trimmed)+'</p>';
  }).join('');
}
function baseInfo(template){
  const canonical=/<link rel="canonical" href="(https:\/\/[^"]+)"\s*\/?>/.exec(template);
  if(!canonical)return null;
  try{const url=new URL(canonical[1]);return url.protocol==='https:'?{origin:url.origin}:null;}
  catch{return null;}
}
const mainMatcher=/<main id="main" tabindex="-1">[\s\S]*?<\/main>/g;
const jsonLdMatcher=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
/** Pure renderer. Returns null on template drift, invalid metadata or invalid public paths. */
export function renderArticleDocument(template,article,all){
  const path=parseArticlePath(article?.path);
  if(!path||!publishedArticle({published_version:1,published_json:JSON.stringify({
    title:article.title,description:article.description,body:article.body
  })}))return null;
  const info=baseInfo(template);
  if(!info)return null;
  const url=info.origin+path.path;
  const labels=copy[path.locale],returnPath=prefix(path.locale)+'/ratgeber/';
  const contact=prefix(path.locale)+'/kontakt/';
  const body='<main id="main" tabindex="-1">'+
    '<article class="container seo-dynamic-article" lang="'+path.locale+'">'+
      '<p class="eyebrow">KnaBa / '+esc(labels.section)+'</p>'+
      '<h1>'+esc(article.title)+'</h1>'+
      '<p class="seo-article-lead">'+esc(article.description)+'</p>'+
      '<div class="seo-article-copy">'+articleBlocks(article.body)+'</div>'+
      '<nav class="seo-article-links" aria-label="'+esc(labels.back)+'">'+
        '<a href="'+returnPath+'">'+esc(labels.back)+'</a>'+
        '<a class="button button-dark" href="'+contact+'">'+esc(labels.contact)+'</a>'+
      '</nav>'+
    '</article></main>';
  let html=replaceOne(template,mainMatcher,body);
  if(html===null)return null;
  const pairs=[
    [/<title>[^<]*<\/title>/g,'<title>'+esc(article.title)+'</title>'],
    [/<meta name="description" content="[^"]*"\s*\/?>/g,'<meta name="description" content="'+esc(article.description)+'">'],
    [/<meta property="og:title" content="[^"]*"\s*\/?>/g,'<meta property="og:title" content="'+esc(article.title)+'">'],
    [/<meta property="og:description" content="[^"]*"\s*\/?>/g,'<meta property="og:description" content="'+esc(article.description)+'">'],
    [/<meta property="og:url" content="[^"]*"\s*\/?>/g,'<meta property="og:url" content="'+esc(url)+'">'],
    [/<meta property="og:type" content="[^"]*"\s*\/?>/g,'<meta property="og:type" content="article">'],
  ];
  for(const [match,to] of pairs){html=replaceOne(html,match,to);if(html===null)return null;}
  html=html.replace(/<link rel="alternate" hreflang="[^"]+" href="[^"]+"\s*\/?>/g,'');
  html=replaceOne(html,/<link rel="canonical" href="[^"]+"\s*\/?>/g,
    '<link rel="canonical" href="'+esc(url)+'">'+linkHtml(articleLinks(article,all,info.origin)));
  if(html===null)return null;
  const schema=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if(!schema)return null;
  let business;
  try{
    const graph=JSON.parse(schema[1]);
    business=(graph['@graph']||[]).find(node=>node['@type']==='LocalBusiness');
  }catch{return null;}
  if(!business?.['@id'])return null;
  const crumbName=labels.back,home=prefix(path.locale)+'/';
  const graph={
    '@context':'https://schema.org',
    '@graph':[
      business,
      {'@type':'Article','@id':url+'#article',headline:article.title,
        description:article.description,inLanguage:path.locale,
        mainEntityOfPage:url,publisher:{'@id':business['@id']}},
      {'@type':'BreadcrumbList',itemListElement:[
        {'@type':'ListItem',position:1,name:'KnaBa',item:info.origin+home},
        {'@type':'ListItem',position:2,name:crumbName,item:info.origin+returnPath},
        {'@type':'ListItem',position:3,name:article.title,item:url}
      ]}
    ]
  };
  html=replaceOne(html,jsonLdMatcher,'<script type="application/ld+json">'+
    JSON.stringify(graph).replaceAll('<','\\u003c')+'</script>');
  return html;
}
export function addPublishedGuideLinks(html,locale,items){
  if(!locales.includes(locale))return html;
  const matching=items.filter(item=>item.locale===locale);
  if(!matching.length)return html;
  if(!/<main id="main" tabindex="-1">/.test(html)||(html.match(/<\/main>/g)||[]).length!==1)return html;
  const labels=copy[locale];
  const links=matching.map(article=>
    '<li><a href="'+esc(article.path)+'">'+esc(article.title)+'</a>'+
    '<p>'+esc(article.description)+'</p></li>').join('');
  return html.replace('</main>','<section class="container seo-published-guides"><h2>'+
    esc(labels.section)+'</h2><p>'+esc(labels.lead)+'</p><ul>'+links+'</ul></section></main>');
}
export function expandPublishedSitemap(xml,origin,articles){
  // The generated base sitemap is empty for non-indexable preview builds.
  if(!xml.includes('<loc>'+origin+'/</loc>')||!xml.includes('</urlset>')||!articles.length)return xml;
  const entries=articles.map(a=>'<url><loc>'+esc(origin+a.path)+'</loc>'+
    linkXml(articleLinks(a,articles,origin))+'</url>').join('');
  return xml.replace('</urlset>',entries+'</urlset>');
}
