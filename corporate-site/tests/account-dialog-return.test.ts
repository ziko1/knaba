import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {describe, expect, it, vi} from 'vitest';
import {safeWorkspaceRedirect} from '../src/lib/workspace-navigation';
import {roleDestination} from '../vps/role-destination.mjs';

// Exercise the real form handler; JSX rendering remains a separate browser gate.
const source = ts.createSourceFile('AccountAccessDialog.tsx', readFileSync(new URL('../src/components/AccountAccessDialog.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.FunctionDeclaration | undefined;
function find(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'submit') handler = node;
  ts.forEachChild(node, find);
}
find(source);
if (!handler) throw Error('Account dialog submit handler missing');
const output = ts.transpileModule(handler.getText(source) + '\nglobalThis.submit = submit;', {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;

async function login(locale: string, returnTo: string | undefined, role = 'client', responseTarget?: string) {
  const request = vi.fn(async (_path: string, init: RequestInit) => ({
    ok: true, status: 200,
    json: async () => ({authenticated: true, returnTo: responseTarget ?? roleDestination(role, String((init.body as URLSearchParams).get('return_to')), locale)}),
  }));
  const navigate = vi.fn();
  const revealError = vi.fn();
  const form = {reset: vi.fn()};
  const context = {
    props: {locale, returnTo}, mode: () => 'login', pending: () => false, checking: () => false,
    FormData: class {get(name: string) {return {email: 'synthetic@example.test', password: 'synthetic-test-password'}[name as 'email' | 'password'] ?? null;}},
    URL, URLSearchParams, safeWorkspaceRedirect,
    cancelRequest: vi.fn(), generation: 0, disposed: false, loginAttempted: false,
    setPending: vi.fn(), setError: vi.fn(), setInfo: vi.fn(), setDirty: vi.fn(),
    setShowPassword: vi.fn(), setSession: vi.fn(), request, revealError,
    document: {dispatchEvent: vi.fn()}, CustomEvent: class {},
    t: () => ({network: 'Network error', error: 'Invalid credentials', invalidForm: 'Invalid form'}),
    readSession: vi.fn(async () => ({user: {id: 'synthetic-user'}, role})), dialog: {open: true},
    window: {location: {assign: navigate}}, submit: undefined as ((event: unknown) => Promise<void>) | undefined,
  };
  runInNewContext(output, context);
  await context.submit!({preventDefault: vi.fn(), currentTarget: form});
  const [path, init] = request.mock.calls[0];
  expect(path).toBe(`/login/?lang=${locale}`);
  expect(init.headers).toEqual({'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json'});
  expect([...(init.body as URLSearchParams).keys()].sort()).toEqual(['email', 'password', 'return_to']);
  return {navigate, revealError, submitted: String((init.body as URLSearchParams).get('return_to'))};
}

describe('account dialog resumes the requested authorized workspace after sign-in', () => {
  for (const locale of ['de', 'en', 'pl', 'lt', 'ru', 'uk']) {
    it(`${locale}: retains an owner section and the explicitly chosen dialog language`, async () => {
      const app = await login(locale, '/admin/?view=studio&lang=de', 'owner');
      expect(app.navigate).toHaveBeenCalledExactlyOnceWith(`/admin/?lang=${locale}&view=studio`);
      expect(new URL(app.submitted, 'https://knaba.invalid').searchParams.get('lang')).toBe(locale);
    });
    it(`${locale}: retains the conversation instead of returning to the overview`, async () => {
      const app = await login(locale, '/konto/?tab=conversations&conversation=thread-1&lang=de');
      expect(app.navigate).toHaveBeenCalledExactlyOnceWith(`/konto/?lang=${locale}&tab=conversations&conversation=thread-1`);
    });
  }

  it.each([undefined, 'https://evil.test/admin/', '//evil.test/admin/', '//[', 'https://[', '/\\evil.test/admin/', '/konto/\nLocation:evil', '/logout/', '/api/portal/roles'])('falls back for unsupported or unsafe intent %s', async returnTo => {
    const app = await login('pl', returnTo);
    expect(app.submitted).toBe('/konto/?lang=pl');
    expect(app.navigate).toHaveBeenCalledExactlyOnceWith('/konto/?lang=pl');
  });

  it.each([['client', '/konto/?lang=lt'], ['admin', '/admin/?lang=lt']])('lets the server deny owner-only navigation for %s', async (role, expected) => {
    const app = await login('lt', '/admin/?view=studio', role);
    expect(app.navigate).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('does not navigate to an external URL returned by a malformed response', async () => {
    const app = await login('pl', '/admin/?view=studio', 'owner', 'https://evil.test/admin/');
    expect(app.navigate).not.toHaveBeenCalled();
    expect(app.revealError).toHaveBeenCalled();
  });
});
