import {afterEach,describe,expect,it,vi} from 'vitest';
import {command} from './api';
import {ChatRequestGeneration} from './chatRequestGeneration';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve};}
afterEach(()=>vi.unstubAllGlobals());
describe('conversation request boundaries (controlled HTTP transport)',()=>{
 it('keeps B messages and its new draft when an A send finishes after switching channels',async()=>{
  const gate=new ChatRequestGeneration(),sendResponse=deferred<{ok:boolean;json:()=>Promise<unknown>}>();gate.selectChannel('channel-a');const send=gate.begin('channel-a','send')!;
  let draft='message for A',messages=['message from B'],refreshes=0;
  vi.stubGlobal('fetch',()=>sendResponse.promise);
  const pending=command('message.send',{channel_id:'channel-a',text:draft,language:'EN'}).then(()=>{draft=gate.update<string>(send,()=>'')(draft);if(gate.accepts(send)){refreshes++;messages=['message from A']}});
  gate.selectChannel('channel-b');draft='new draft for B';sendResponse.resolve({ok:true,json:async()=>({id:'sent-a'})});await pending;
  expect(draft).toBe('new draft for B');expect(messages).toEqual(['message from B']);expect(refreshes).toBe(0);expect(send.signal.aborted).toBe(true);
  // The old A callback cannot obtain a newer sequence after the B selection.
  expect(gate.begin('channel-a','messages')).toBeUndefined();expect(gate.accepts(gate.begin('channel-b','messages')!)).toBe(true);
 });
 it('drops an already parsed A read updater and an A translation after selecting B',()=>{
  const gate=new ChatRequestGeneration();gate.selectChannel('channel-a');const read=gate.begin('channel-a','messages')!,translation=gate.begin('channel-a','translation:message-a')!;
  const queuedMessages=gate.update(read,()=>['private A history']),queuedTranslation=gate.update(translation,()=>({a:'translation from A'}));
  gate.selectChannel('channel-b');expect(queuedMessages(['B history'])).toEqual(['B history']);expect(queuedTranslation({})).toEqual({});
 });
 it('keeps send completion independent from newer reads in the same conversation',()=>{
  const gate=new ChatRequestGeneration();gate.selectChannel('channel-a');const send=gate.begin('channel-a','send')!,oldRead=gate.begin('channel-a','messages')!,freshRead=gate.begin('channel-a','messages')!;
  expect(gate.accepts(send)).toBe(true);expect(gate.accepts(oldRead)).toBe(false);expect(gate.accepts(freshRead)).toBe(true);
  expect(gate.selectChannel('channel-a')).toBe(false);expect(gate.accepts(send)).toBe(true);
 });
 it('does not revive revoked authority when a queued channel selection or StrictMode replay occurs',()=>{
  const gate=new ChatRequestGeneration();gate.mount();gate.selectChannel('channel-a');const beforeUnmount=gate.begin('channel-a','messages')!;gate.unmount();expect(gate.accepts(beforeUnmount)).toBe(false);
  expect(gate.mount()).toBe(true);const send=gate.begin('channel-a','send')!;gate.invalidate();gate.selectChannel('channel-b');expect(gate.accepts(send)).toBe(false);expect(gate.mount()).toBe(false);expect(gate.begin('channel-b','messages')).toBeUndefined();
 });
});
