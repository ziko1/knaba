import {describe,expect,it,vi} from 'vitest';
import {ASSISTANT_TICKET_STORAGE,createAssistantTicketStore} from '../src/lib/assistant-ticket';

const ticket={id:'43bb00af-fccc-4495-ac32-b2e354190570',token:'a'.repeat(64)};
function fixture(){
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  return {values,storage,store:createAssistantTicketStore(()=>storage)};
}
describe('explicit assistant inquiry ticket',()=>{
  it('does not turn an existing chat or an intent URL into a captured submission context',()=>{
    const {store,values}=fixture();values.set(ASSISTANT_TICKET_STORAGE,JSON.stringify(ticket));
    expect(store.current()).toEqual(ticket);expect(store.captured()).toBeNull();
    expect(store.capture({...ticket,token:'b'.repeat(64)})).toBe(false);
    expect(store.capture(ticket)).toBe(true);expect(store.captured()).toEqual(ticket);
    const copied=store.captured()!;copied.token='c'.repeat(64);expect(store.captured()).toEqual(ticket);
    expect([...values.keys()]).toHaveLength(2);
    for(const raw of values.values())expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['id','token']);
  });
  it('invalidates checkpoints after reset and after replacement by the same restored capability',()=>{
    const {store}=fixture(),listener=vi.fn();store.subscribe(listener);
    store.write(ticket);store.capture(ticket);const current=store.checkpoint(ticket);expect(current()).toBe(true);
    store.write(null);expect(current()).toBe(false);expect(store.captured()).toBeNull();
    store.write(ticket);store.capture(ticket);expect(current()).toBe(false);
    expect(listener.mock.calls.every(args=>args.length===0)).toBe(true);
  });
  it('fails closed on unavailable storage and malformed stored tickets',()=>{
    const {store,storage,values}=fixture();store.write(ticket);store.capture(ticket);const current=store.checkpoint(ticket);
    vi.spyOn(storage,'removeItem').mockImplementation(()=>{throw Error('Storage unavailable');});
    expect(store.write(null)).toBe(false);expect(store.current()).toBeNull();expect(store.captured()).toBeNull();expect(current()).toBe(false);
    const fresh=createAssistantTicketStore(()=>storage);
    values.set(ASSISTANT_TICKET_STORAGE,JSON.stringify({id:'-'.repeat(36),token:'a'.repeat(64)}));expect(fresh.current()).toBeNull();
    values.set(ASSISTANT_TICKET_STORAGE,'{malformed');expect(fresh.capture(ticket)).toBe(false);
  });
  it('requires both stored identities on every check and never accepts another thread with the same bearer',()=>{
    const {store,values}=fixture();store.write(ticket);store.capture(ticket);const current=store.checkpoint(ticket);
    values.set(ASSISTANT_TICKET_STORAGE,JSON.stringify({...ticket,id:'53bb00af-fccc-4495-ac32-b2e354190570'}));
    expect(current()).toBe(false);expect(store.captured()).toBeNull();
  });
});
