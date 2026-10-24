import { describe, it, expect } from 'vitest';
import { formatRecoveryCode, parseRecoveryCode } from '../src/lib/assistant-recovery';

const ticket = { id:'43bb00af-fccc-4495-ac32-b2e354190570', token:'a'.repeat(64) };
describe('visitor recovery', () => {
  it('round trips a scoped secret without a public URL', () => {
    const code = formatRecoveryCode(ticket);
    expect(parseRecoveryCode(code)).toEqual(ticket);
    expect(parseRecoveryCode(' '+code+' ')).toEqual(ticket);
  });
  it('rejects invalid codes', () => {
    const code = formatRecoveryCode(ticket);
    expect(parseRecoveryCode('invalid')).toBeNull();
    expect(parseRecoveryCode(code.slice(0,-1))).toBeNull();
    expect(parseRecoveryCode(code+'garbage')).toBeNull();
  });
});
