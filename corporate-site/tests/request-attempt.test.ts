import {describe,expect,it,vi} from 'vitest';
import {createRequestAttempt} from '../src/lib/request-attempt';
const input={service:'baureinigung',objectType:'Baustelle',postcode:'10315',area:'100',frequency:'Einmalig',address:'Test 1',message:'Synthetic request details',privacyAccepted:true as const};
describe('cabinet request delivery attempts',()=>{
  it('keeps the exact accepted payload and key after an ambiguous timeout even if fields change',()=>{
    const key=vi.fn().mockReturnValue('synthetic-key-1');const attempt=createRequestAttempt(key);
    const original=attempt.begin(input);attempt.finish({ok:false});
    const retry=attempt.begin({...input,message:'Changed during timeout'});
    expect(retry).toBe(original);expect(retry.message).toBe(input.message);expect(key).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(retry)).toBe(true);
    attempt.finish({ok:true});expect(attempt.pending).toBeNull();
  });
  it.each([400,401,403,404,413,415,422,429])('unlocks a definite HTTP %i rejection for correction and a fresh key',status=>{
    let n=0;const attempt=createRequestAttempt(()=>`key-${++n}`);const first=attempt.begin(input);
    attempt.finish({ok:false,status});expect(attempt.pending).toBeNull();
    const next=attempt.begin({...input,postcode:'12345'});expect(next.idempotencyKey).not.toBe(first.idempotencyKey);expect(next.postcode).toBe('12345');
  });
  it.each([408,409,500,502,503,504])('preserves the delivery attempt after HTTP %i',status=>{
    const attempt=createRequestAttempt(()=> 'synthetic-key');const first=attempt.begin(input);
    attempt.finish({ok:false,status});expect(attempt.pending).toBe(first);
  });
  it('does not leave a locked attempt if generating a key fails',()=>{
    const attempt=createRequestAttempt(()=>{throw Error('crypto unavailable');});
    expect(()=>attempt.begin(input)).toThrow();expect(attempt.pending).toBeNull();
  });
});
