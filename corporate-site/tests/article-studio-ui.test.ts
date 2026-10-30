import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
describe('KNABA Studio owner-only knowledge editor',()=>{
  it('reuses the existing secured Studio shell instead of a second CMS',()=>{
    const studio=source('components/SiteStudio.tsx');
    expect(studio).toContain("import ArticleStudio from './ArticleStudio'");
    expect(studio).toContain('<Show when={!checking()&&authorized()}>');
    expect(studio).toContain('<ArticleStudio language={language()} onDirtyChange={setArticleDirty} />');
  });
  it('exposes draft, explicit publication, inline preview and localized SEO fields',()=>{
    const article=source('components/ArticleStudio.tsx');
    expect(article).toContain("'/api/studio/article/draft'");
    expect(article).toContain("'/api/studio/article/publish'");
    expect(article).toContain("'/api/studio/article/unpublish'");
    expect(article).toContain("unpublishCheck()!=='UNPUBLISH'");
    expect(article).toContain("'/api/studio/articles'");
    expect(article).toContain('confirm');
    expect(article).toContain('preview');
    expect(article).toContain('maxLength={6000}');
    expect(article).not.toContain('dangerouslySetInnerHTML');
    expect(article).not.toContain('innerHTML');
  });
});
