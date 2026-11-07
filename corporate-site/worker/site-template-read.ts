import type { D1Database } from './types';
import { BUILTIN_TEMPLATES, validateSiteTemplate, type SiteTemplate } from '../src/lib/site-template-contract.ts';
import { renderTemplateHtml } from '../src/lib/site-template-render.ts';
export type TemplateView = SiteTemplate & {digest:string;builtin:boolean};
export function templateManifest(view:TemplateView):SiteTemplate{const {digest:_digest,builtin:_builtin,...manifest}=view;return manifest;}
type Row=Record<string,unknown>;
export class TemplateFault extends Error {
  readonly status:number;readonly code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
}
export const fail=(status:number,code:string,message:string):never=>{throw new TemplateFault(status,code,message);};
export const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export async function readBoundedHtml(source:Response):Promise<string>{
  if(Number(source.headers.get('content-length')??0)>400_000)fail(413,'preview_size','Seite ist zu groß.');
  const reader=source.body?.getReader();if(!reader)return fail(503,'preview_unavailable','Seite ist leer.');
  const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>400_000){await reader.cancel();fail(413,'preview_size','Seite ist zu groß.');}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function builtins():Promise<TemplateView[]>{
  return Promise.all(BUILTIN_TEMPLATES.map(async item=>{const template=validateSiteTemplate(item);return {...template,digest:await hash(JSON.stringify(template)),builtin:true};}));
}
export async function resolveTemplate(db:D1Database,digest:string):Promise<TemplateView>{
  const builtin=(await builtins()).find(item=>item.digest===digest);
  if(builtin)return builtin;
  const row=await db.prepare('SELECT manifest_json FROM studio_templates WHERE digest=?').bind(digest).first<Row>();
  if(!row)fail(404,'template_missing','Vorlage nicht gefunden.');
  const manifest=validateSiteTemplate(JSON.parse(String(row!.manifest_json)));
  if(await hash(JSON.stringify(manifest))!==digest)fail(503,'template_integrity','Vorlagenprüfung fehlgeschlagen.');
  return {...manifest,digest,builtin:false};
}
export async function stateRow(db:D1Database):Promise<Row>{
  return await db.prepare('SELECT * FROM studio_template_state WHERE id=1').first<Row>()??fail(503,'template_schema','Vorlagenmigration fehlt.');
}
export async function applyActiveTemplate(html:string,db:D1Database):Promise<string>{
  const row=await stateRow(db);
  if(!row.active_digest)return html;
  return renderTemplateHtml(html,templateManifest(await resolveTemplate(db,String(row.active_digest))));
}
