import {lstatSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

/** Read-only, fail-closed migration source preflight. No DB connection or writes. */
export function inspectMigrationSequence(directory){
  const entries=readdirSync(directory,{withFileTypes:true});
  const names=[];
  const byOrdinal=new Map();
  for(const entry of entries){
    const match=/^(\d{4})_[a-zA-Z0-9_]+\.sql$/.exec(entry.name);
    if(!match)continue;
    if(!entry.isFile())throw Error('INVALID_MIGRATION_FILE:'+entry.name);
    const previous=byOrdinal.get(match[1]);
    if(previous)throw Error('MIGRATION_ORDER_COLLISION:'+match[1]);
    byOrdinal.set(match[1],entry.name);
    names.push(entry.name);
  }
  names.sort();
  const journalPath=join(directory,'meta','_journal.json');
  if(!lstatSync(journalPath).isFile())throw Error('INVALID_MIGRATION_JOURNAL');
  let journal;
  try{journal=JSON.parse(readFileSync(journalPath,'utf8'));}
  catch{throw Error('INVALID_MIGRATION_JOURNAL');}
  if(!journal||journal.dialect!=='sqlite'||!Array.isArray(journal.entries))throw Error('INVALID_MIGRATION_JOURNAL');
  const known=new Set(names),registered=new Set();
  for(const [idx,entry] of journal.entries.entries()){
    if(!entry||entry.idx!==idx||typeof entry.tag!=='string'
       ||!/^\d{4}_[a-zA-Z0-9_]+$/.test(entry.tag)
       ||registered.has(entry.tag))throw Error('INVALID_MIGRATION_JOURNAL_ORDER');
    const name=entry.tag+'.sql';
    if(!known.has(name))throw Error('JOURNAL_REFERENCES_MISSING_SQL:'+name);
    if(name!==names[idx])throw Error('JOURNAL_SQL_ORDER_MISMATCH:'+entry.tag);
    if(!Number.isSafeInteger(entry.when)||entry.when<0
       ||(idx>0&&entry.when<=journal.entries[idx-1].when))
      throw Error('INVALID_MIGRATION_JOURNAL_TIMESTAMP:'+entry.tag);
    registered.add(entry.tag);
  }
  for(const name of names){
    if(!registered.has(name.slice(0,-4)))throw Error('UNJOURNALED_MIGRATION:'+name);
  }
  return {names,journalEntries:registered.size};
}
