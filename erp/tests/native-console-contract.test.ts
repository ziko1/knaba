import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {registry} from '../apps/api/registry.ts';

// Cross-boundary compatibility, not a device or SQL acceptance test. A native primary-ID
// shortcut must fail review when the actual command name or required input field changes.
const source=readFileSync(new URL('../apps/mobile-android/app/src/main/java/de/knaba/mobile/ConsoleRecordActions.kt',import.meta.url),'utf8');
const bindings=[...source.matchAll(/"([a-z_]+)" to binding\("([a-zA-Z]+)", ([^\n]+)\)/g)].flatMap(match=>
 [...match[3]!.matchAll(/"([a-z_.]+)"/g)].map(command=>({kind:match[1]!,field:match[2]!,command:command[1]!})));

describe('native record actions against the executable ERP command contract',()=>{
 it('has an unambiguous primary entity for each contextual action',()=>{
  expect(bindings.length).toBeGreaterThan(40);
  expect(new Set(bindings.map(row=>row.command)).size).toBe(bindings.length);
 });
 it.each(bindings)('$kind / $command binds required $field',({command,field})=>{
  const definition=registry[command as keyof typeof registry];
  expect(definition,`Native command does not exist: ${command}`).toBeDefined();
  const schema=zodToJsonSchema(definition.schema,{$refStrategy:'none'}) as {properties?:Record<string,{type?:string}>;required?:string[]};
  expect(schema.required).toContain(field);
  expect(schema.properties?.[field]?.type).toBe('string');
  expect(definition.permission).toMatch(/^[a-z][a-z_.]+$/);
 });
});
