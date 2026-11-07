import {DomainError} from '../domain/core.ts';

// Defense in depth for Zod 3 GHSA-mrhx-c7xc-m3w5: size constraints in a
// schema do not stop its element parser. Inspect bounded structure first,
// without creating a validation issue for each invalid element.
export const VALIDATION_INPUT_BUDGET=Object.freeze({collectionEntries:1000,nodes:20000,depth:20});

export function assertValidationInputBudget(value:unknown,code='VALIDATION_ERROR'):void {
 const ancestors=new Set<object>();let nodes=0;
 const fail=():never=>{throw new DomainError(code,{reason:'VALIDATION_INPUT_LIMIT_EXCEEDED'});};
 const visit=(item:unknown,depth:number):void=>{
  if(++nodes>VALIDATION_INPUT_BUDGET.nodes||depth>VALIDATION_INPUT_BUDGET.depth)fail();
  if(item===null||typeof item!=='object')return;
  if(ancestors.has(item))fail();
  if(Array.isArray(item)&&item.length>VALIDATION_INPUT_BUDGET.collectionEntries)fail();
  ancestors.add(item);
  if(Array.isArray(item)){
   for(const child of item)visit(child,depth+1);
  }else{
   let entries=0;
   for(const key in item){
    if(!Object.hasOwn(item,key))continue;
    if(++entries>VALIDATION_INPUT_BUDGET.collectionEntries)fail();
    visit((item as Record<string,unknown>)[key],depth+1);
   }
  }
  ancestors.delete(item);
 };
 visit(value,0);
}
