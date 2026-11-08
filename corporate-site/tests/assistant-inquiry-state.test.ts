import {describe,expect,it,vi} from 'vitest';
import {createInquiryDraftMemory} from '../src/lib/inquiry-draft';
import {emptyInquiry} from '../src/lib/inquiry';

const ticket={id:'43bb00af-fccc-4495-ac32-b2e354190570',token:'a'.repeat(64)};
const answers={...emptyInquiry(),name:'Synthetic guest',email:'guest@example.invalid',message:'Keep this on the site'};
const draft={data:answers,topic:'bauhilfe',step:2,reviewing:true};

describe('assistant inquiry context isolation',()=>{
  it('keeps the public draft and pending body separate from a captured guest capability',()=>{
    const memory=createInquiryDraftMemory();memory.save(draft);
    const publicBody=memory.prepareSubmission(answers,'',()=> 'public-key');
    const guest=memory.forAssistant(ticket);
    expect(guest.read()).toBeNull();
    guest.save({...draft,data:{...answers,name:'Different guest draft'}});
    const guestBody=guest.prepareSubmission(answers,'',()=> 'guest-key');
    expect(guestBody).toMatchObject({idempotencyKey:'guest-key',transferAccepted:true});
    expect(publicBody).not.toHaveProperty('transferAccepted');
    expect(memory.read()?.data.name).toBe('Synthetic guest');
    guest.clear();expect(memory.read()?.data).toEqual(answers);
  });
  it('retains the exact pending bytes and key across locales only for the complete ticket',()=>{
    const memory=createInquiryDraftMemory(),guest=memory.forAssistant(ticket),createId=vi.fn(()=> 'original-key');
    const first=JSON.stringify(guest.prepareSubmission(answers,'',createId));
    const same=memory.forAssistant({...ticket});
    expect(JSON.stringify(same.prepareSubmission({...answers,message:'Localized retry must not replace bytes'},'',createId))).toBe(first);
    expect(createId).toHaveBeenCalledOnce();
    const changed=memory.forAssistant({...ticket,token:'b'.repeat(64)});
    expect(changed.read()).toBeNull();
    expect(changed.prepareSubmission(answers,'',()=> 'changed-key').idempotencyKey).toBe('changed-key');
    expect(guest.read()).toBeNull();
  });
  it('invalidates guest memory on capability loss without clearing an unrelated public draft',()=>{
    const memory=createInquiryDraftMemory();memory.save(draft);
    const guest=memory.forAssistant(ticket);guest.save(draft);guest.prepareSubmission(answers,'',()=> 'old-key');
    memory.forgetAssistant(ticket);
    expect(guest.read()).toBeNull();
    expect(memory.forAssistant(ticket).prepareSubmission(answers,'',()=> 'fresh-key').idempotencyKey).toBe('fresh-key');
    expect(memory.read()?.data).toEqual(answers);
  });
});
