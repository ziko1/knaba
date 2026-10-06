import { describe, expect, it } from 'vitest';
// The production CLI is an ESM JavaScript module with no declaration file.
// @ts-expect-error TS7016: test the actual CLI helper without introducing a second implementation.
import { assertLocalContainerTarget } from '../scripts/pg-tools.mjs';

const mismatch = 'RESTORE_CONTAINER_TARGET_IDENTITY_MISMATCH';
const remote = 'CONTAINER_TRANSPORT_REQUIRES_VERIFIED_LOCAL_TARGET_USE_NATIVE_FOR_REMOTE';
const database = 'synthetic_backup_target';
const connection = (host: string, port?: number) => `postgresql://synthetic_user@${host}${port === undefined ? '' : ':' + port}/${database}`;
const binding = (host = '127.0.0.1', port = '5432') => ({ '5432/tcp': [{ HostIp: host, HostPort: port }] });

describe('backup/restore container transport binds the actual database endpoint', () => {
  it('accepts the exact loopback PostgreSQL mapping, with default and explicit 5432', () => {
    expect(() => assertLocalContainerTarget(connection('127.0.0.1'), binding())).not.toThrow();
    expect(() => assertLocalContainerTarget(connection('127.0.0.1', 5432), binding())).not.toThrow();
  });
  it('a matching database name cannot authorize a different host or published port', () => {
    expect(() => assertLocalContainerTarget(connection('127.0.0.1', 5433), binding())).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('[::1]', 5432), binding())).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('127.0.0.1', 5432), binding('::1'))).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('remote.example.test', 5432), binding())).toThrow(remote);
  });
  it('explicit local port 5433 is accepted only against the selected container mapping 5433', () => {
    const remapped = binding('127.0.0.1', '5433');
    expect(() => assertLocalContainerTarget(connection('127.0.0.1', 5433), remapped)).not.toThrow();
    expect(() => assertLocalContainerTarget(connection('127.0.0.1'), remapped)).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('127.0.0.1', 5434), remapped)).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('localhost', 5433), remapped)).not.toThrow();
  });
  it('IPv6 and localhost must resolve through a declared matching loopback binding', () => {
    const ipv6 = binding('::1', '5433');
    expect(() => assertLocalContainerTarget(connection('[::1]', 5433), ipv6)).not.toThrow();
    expect(() => assertLocalContainerTarget(connection('localhost', 5433), ipv6)).not.toThrow();
    expect(() => assertLocalContainerTarget(connection('LOCALHOST', 5433), ipv6)).not.toThrow();
    expect(() => assertLocalContainerTarget(connection('[::1]', 5432), ipv6)).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('127.0.0.1', 5433), ipv6)).toThrow(mismatch);
  });
  it.each([
    'remote.example.test', 'localhost.remote.example.test', 'localhost.', 'localhost.localdomain',
    '127.0.0.1.remote.example.test', '127.0.0.2', '127.1', '2130706433', '0x7f000001',
    '0177.0.0.1', '%31%32%37.0.0.1', '[::ffff:127.0.0.1]', '[2001:db8::1]',
  ])('rejects a remote or deceptive loopback alias without DNS/network work: %s', host => {
    expect(() => assertLocalContainerTarget(connection(host), binding())).toThrow(remote);
  });
  it('uses the URL target host after userinfo rather than a localhost substring', () => {
    const crafted = `postgresql://localhost@remote.example.test:5432/${database}`;
    expect(() => assertLocalContainerTarget(crafted, binding())).toThrow(remote);
  });
  it.each([undefined, null, {}, { '5432/tcp': null }, { '5432/tcp': [] }, { '5432/tcp': {} }, { '5433/tcp': [{ HostIp: '127.0.0.1', HostPort: '5432' }] }])('rejects missing/malformed or different container-port metadata: %j', ports => {
    expect(() => assertLocalContainerTarget(connection('127.0.0.1'), ports)).toThrow(mismatch);
  });
  it.each(['0.0.0.0', '::', '', 'localhost'])('wildcard/undeclared bindings cannot verify a selected loopback host: %s', host => {
    expect(() => assertLocalContainerTarget(connection('localhost'), binding(host))).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('127.0.0.1'), binding(host))).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('[::1]'), binding(host))).toThrow(mismatch);
  });
  it('searches actual bindings but cannot be satisfied by unrelated entries or numeric port metadata', () => {
    const ports = { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '5432' }, { HostIp: '127.0.0.1', HostPort: '5433' }] };
    expect(() => assertLocalContainerTarget(connection('localhost', 5433), ports)).not.toThrow();
    expect(() => assertLocalContainerTarget(connection('localhost', 5432), ports)).toThrow(mismatch);
    expect(() => assertLocalContainerTarget(connection('127.0.0.1'), { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: 5432 }] })).toThrow(mismatch);
  });
});
