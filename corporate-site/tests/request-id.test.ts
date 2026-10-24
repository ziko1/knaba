import {describe,it,expect} from 'vitest';
import {createRequestId} from '../src/lib/request-id';
describe('browser idempotency key compatibility',()=>{
  it('works without secure-context randomUUID using cryptographic random values',()=>{
    const source = {getRandomValues: crypto.getRandomValues.bind(crypto)};
    const first=createRequestId(source),second=createRequestId(source);
    expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(first).not.toBe(second);
  });
  it('fails closed when cryptographic randomness is unavailable',()=>{
    expect(()=>createRequestId({} as Crypto)).toThrow('Browser');
  });
});
