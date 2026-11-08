import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {registry} from '../apps/api/registry.ts';
import {mediaUploadKey,mediaUploadSchema} from '../apps/api/media-upload.ts';
import {PDF_BYTE_LIMIT,PHOTO_BYTE_LIMIT,assertMediaSize} from '../packages/storage/media-limits.ts';

// Cross-boundary compatibility, not a device or SQL acceptance test. A native primary-ID
// shortcut must fail review when the actual command name or required input field changes.
const source=readFileSync(new URL('../apps/mobile-android/app/src/main/java/de/knaba/mobile/ConsoleRecordActions.kt',import.meta.url),'utf8');
const bindings=[...source.matchAll(/"([a-z_]+)" to binding\("([a-zA-Z]+)", ([^\n]+)\)/g)].flatMap(match=>
 [...match[3]!.matchAll(/"([a-z_.]+)"/g)].map(command=>({kind:match[1]!,field:match[2]!,command:command[1]!})));
const iosPath=new URL('../apps/mobile-ios/Sources/ERPRecordActions.swift',import.meta.url);
const iosSource=existsSync(iosPath)?readFileSync(iosPath,'utf8'):'';
const iosBindings=[...iosSource.matchAll(/"([a-z_]+)": binding\("([a-zA-Z]+)", ([^\n]+)\)/g)].flatMap(match=>
 [...match[3]!.matchAll(/"([a-z_.]+)"/g)].map(command=>({kind:match[1]!,field:match[2]!,command:command[1]!})));

describe.each([{platform:'Android',rows:bindings},{platform:'iOS',rows:iosBindings}])('$platform record actions against the executable ERP command contract',({rows})=>{
 it('has an unambiguous primary entity for each contextual action',()=>{
  expect(rows.length).toBeGreaterThan(40);
  expect(new Set(rows.map(row=>row.command)).size).toBe(rows.length);
 });
 it.each(rows)('$kind / $command binds required $field',({command,field})=>{
  const definition=registry[command as keyof typeof registry];
  expect(definition,`Native command does not exist: ${command}`).toBeDefined();
  const schema=zodToJsonSchema(definition.schema,{$refStrategy:'none'}) as {properties?:Record<string,{type?:string}>;required?:string[]};
  expect(schema.required).toContain(field);
  expect(schema.properties?.[field]?.type).toBe('string');
  expect(definition.permission).toMatch(/^[a-z][a-z_.]+$/);
 });
});

it('keeps the shared bindings and preserves the existing iOS checklist/review actions',()=>{
 const extraTasks=['task.checklist','task.review'];
 const ordered=(rows:typeof bindings)=>rows.slice().sort((a,b)=>a.command.localeCompare(b.command));
 expect(ordered(iosBindings.filter(row=>!extraTasks.includes(row.command)))).toEqual(ordered(bindings));
 expect(iosBindings.filter(row=>extraTasks.includes(row.command)).map(row=>row.command).sort()).toEqual(extraTasks);
 const path=new URL('../apps/mobile-ios/Sources/ERPActionLabels.swift',import.meta.url);
 const labelsSource=existsSync(path)?readFileSync(path,'utf8').split('static func field(')[0]!:'';
 const labels=[...labelsSource.matchAll(/case ([^\n]+): key = \.[a-zA-Z]+/g)].flatMap(match=>[...match[1]!.matchAll(/"([a-z_.]+)"/g)].map(value=>value[1]));
 for(const row of iosBindings)expect(labels,`Missing iOS action label: ${row.command}`).toContain(row.command);
});

it('checks the iOS quote fixture against the actual permission and complete JSON schema',()=>{
 const path=new URL('../apps/mobile-ios/Tests/ERPRecordActionModelTests.swift',import.meta.url);
 const fixture=existsSync(path)?readFileSync(path,'utf8'):'';
 const match=fixture.match(/private let recordQuoteCatalog = #"([^\n]+)"#/);
 expect(match).not.toBeNull();
 const definition=JSON.parse(match![1]!).items[0];
 const actual=registry['quote.accept'];
 expect(definition.name).toBe('quote.accept');
 expect(definition.permission).toBe(actual.permission);
 expect(definition.highRisk).toBe(Boolean(actual.highRisk));
 expect(definition.schema).toEqual(zodToJsonSchema(actual.schema,{$refStrategy:'none'}));
 expect(actual.schema.safeParse({id:'quote-a',quoteVersion:3,acceptanceEvidence:'Explicit approval'}).success).toBe(true);
});

// Native policies are compared with the executable server schemas. HTTP, picker,
// storage and authority behavior have separate platform tests; this is schema parity.
const androidMedia=readFileSync(new URL('../apps/mobile-android/app/src/main/java/de/knaba/mobile/ErpMedia.java',import.meta.url),'utf8');
const iosMedia=readFileSync(new URL('../apps/mobile-ios/Sources/ERPMedia.swift',import.meta.url),'utf8');
const strings=(match:RegExpMatchArray|null)=>[...(match?.[1]??'').matchAll(/"([A-Za-z_]+)"/g)].map(value=>value[1]!);
const mediaPolicies=[
 {platform:'Android',stages:strings(androidMedia.match(/STAGES = Set\.of\(([^;]+)\)/)),visibilities:strings(androidMedia.match(/VISIBILITIES = Set\.of\(([^;]+)\)/)),
  fields:strings(androidMedia.match(/INPUT_KEYS = Set\.of\(([^;]+)\)/))},
 {platform:'iOS',stages:strings(iosMedia.match(/static let stages = \[([^\]]+)\]/)),visibilities:strings(iosMedia.match(/static let visibilities = \[([^\]]+)\]/)),
  fields:[...(iosMedia.split('struct ERPMediaInput:')[1]?.split('func validate()')[0]??'').matchAll(/let ([a-zA-Z]+):/g)].map(value=>value[1]!)},
];
describe.each(mediaPolicies)('$platform typed media against the executable server schema',({stages,visibilities,fields})=>{
 it('requires the real media.upload permission and preserves all supported register stages and visibilities',()=>{
  const definition=registry['media.register'];
  const schema=zodToJsonSchema(definition.schema,{$refStrategy:'none'}) as {properties:Record<string,{enum?:string[];type?:string;minLength?:number;maxLength?:number}>};
  expect(definition.permission).toBe('media.upload');
  expect(stages.slice().sort()).toEqual(schema.properties.stage!.enum!.slice().sort());
  expect(visibilities.slice().sort()).toEqual(schema.properties.visibility!.enum!.slice().sort());
  expect(fields.slice().sort()).toEqual(['siteId','taskId','stage','visibility','caption','retentionPurpose'].sort());
  for(const field of fields)expect(schema.properties[field],`Unknown native register field ${field}`).toBeDefined();
  expect(schema.properties.uploadId).toMatchObject({type:'string',minLength:1,maxLength:100});
  expect(schema.properties.caption).toMatchObject({type:'string',maxLength:2000});
  expect(schema.properties.retentionPurpose).toMatchObject({type:'string',minLength:3,maxLength:2000});
 });
 it('accepts every native combination and non-UUID canonical IDs without invented attach effects',()=>{
  for(const stage of stages)for(const visibility of visibilities){
   const input={uploadId:'a'.repeat(64),siteId:'site-opaque-1',taskId:'task-opaque-1',stage,visibility,caption:'',retentionPurpose:'Task evidence'};
   expect(registry['media.register'].schema.safeParse(input).success).toBe(true);
   expect(registry['media.register'].schema.safeParse({...input,nativeMedia:true}).success).toBe(false);
   expect(registry['media.register'].schema.safeParse({...input,photoIds:['unregistered-id']}).success).toBe(false);
  }
 });
});
it('keeps typed upload metadata, MIME types and original-key constraints aligned with the API',()=>{
 const common={base64:'JVBERi0xLjcK',fileName:'document.pdf',redactionConfirmed:false};
 for(const mimeType of ['image/jpeg','image/png','image/webp','application/pdf'])expect(mediaUploadSchema.safeParse({...common,mimeType}).success).toBe(true);
 expect(mediaUploadSchema.safeParse({...common,mimeType:'image/heic'}).success).toBe(false);
 expect(mediaUploadSchema.safeParse({...common,mimeType:'application/pdf',uri:'content://not-a-server-input'}).success).toBe(false);
 expect(mediaUploadKey('00000000-0000-4000-8000-000000000001',true)).toBe('00000000-0000-4000-8000-000000000001');
 expect(()=>mediaUploadKey('space forbidden',true)).toThrow();
});
it('keeps both native original-file limits equal to the actual ingestion limits',()=>{
 const multiplier=(source:string,name:string)=>{
  const match=source.match(new RegExp(`\\b${name} = (\\d+ \\* 1024 \\* 1024)`));
  expect(match,`Missing bounded native media limit ${name}`).not.toBeNull();
  return match![1]!.split('*').map(value=>Number(value.trim())).reduce((a,b)=>a*b,1);
 };
 for(const [source,image,pdf] of [[androidMedia,'IMAGE_BYTES','PDF_BYTES'],[iosMedia,'images','pdf']] as const){
  expect(multiplier(source,image)).toBe(PHOTO_BYTE_LIMIT);
  expect(multiplier(source,pdf)).toBe(PDF_BYTE_LIMIT);
 }
 expect(()=>assertMediaSize(PHOTO_BYTE_LIMIT,'image/jpeg')).not.toThrow();
 expect(()=>assertMediaSize(PHOTO_BYTE_LIMIT+1,'image/jpeg')).toThrow();
 expect(()=>assertMediaSize(PDF_BYTE_LIMIT,'application/pdf')).not.toThrow();
 expect(()=>assertMediaSize(PDF_BYTE_LIMIT+1,'application/pdf')).toThrow();
});
