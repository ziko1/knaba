import { describe, expect, it } from 'vitest';
import { createCapability, restoreConversation } from '../src/lib/assistant-conversation';
import { formatRecoveryCode, parseRecoveryCode } from '../src/lib/assistant-recovery';

const uuid = 'f51bb237-8e9d-4d76-9c2f-6812d171a881';

describe('KNABA v2 private guest chat recovery', () => {
  it('round trips exactly the existing 256-bit base64url capability (case sensitive)', () => {
    const identity = { id: uuid, capability: createCapability() };
    const code = formatRecoveryCode(identity);
    expect(code).toMatch(/^KNABA2:[0-9a-f-]{36}:[a-zA-Z0-9_-]{43}$/);
    expect(parseRecoveryCode(code)).toEqual(identity);
    expect(parseRecoveryCode('  ' + code + '  ')).toEqual(identity);
    expect(restoreConversation(JSON.stringify(parseRecoveryCode(code)))).toEqual(identity);
    expect(code).not.toMatch(/^https?:|[?&#]/);
  });

  it('does not lowercase a capability or accept a modified secret', () => {
    const cap = createCapability();
    const code = formatRecoveryCode({ id: uuid, capability: cap });
    const parsed = parseRecoveryCode(code);
    expect(parsed?.capability).toBe(cap);
    expect(parseRecoveryCode(code.replace('KNABA2:', 'KNABA1:'))).toBeNull();
    expect(parseRecoveryCode(code.slice(0,-1))).toBeNull();
    expect(parseRecoveryCode(code + '\nINJECTED')).toBeNull();
  });

  it('rejects malformed, oversized, script-like, path and weak credentials', () => {
    const payloads = [
      '', ' ', 'KNABA2:', 'KNABA2:../editor/:abc',
      'KNABA2:' + uuid + ':weak',
      'KNABA2:' + uuid + ':' + 'a'.repeat(43) + '/extra',
      'KNABA2:' + uuid + ':' + 'a'.repeat(250),
      'https://kneba.vsp.rest/konto/?key=' + 'a'.repeat(43),
      '<script>alert(1)</script>',
    ];
    for (const payload of payloads) expect(parseRecoveryCode(payload)).toBeNull();
    expect(parseRecoveryCode(null as unknown as string)).toBeNull();
    expect(() => formatRecoveryCode({ id: '../escape', capability: 'abc' })).toThrow();
  });
});
