import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {registry} from '../apps/api/registry.ts';

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
