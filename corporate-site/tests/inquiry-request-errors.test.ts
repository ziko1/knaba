import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {describe, expect, it, vi} from 'vitest';
import {publicApiError, publicText, type PublicLocale} from '../src/lib/public-i18n';
import {portalHeader} from '../src/lib/portal-contract';

const source = ts.createSourceFile('Inquiry.tsx', readFileSync(new URL('../src/components/Inquiry.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.FunctionDeclaration | undefined;
function find(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'sendRequest') handler = node;
  ts.forEachChild(node, find);
}
find(source);
if (!handler) throw Error('Inquiry send handler missing');
const output = ts.transpileModule(handler.getText(source) + '\nglobalThis.sendRequest = sendRequest;', {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;

const retryText = 'Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.';
const timeoutText = 'Die Verbindung hat zu lange gedauert. Sie können mit derselben Anfrage erneut versuchen oder uns direkt kontaktieren.';
const validationText = 'Bitte prüfen Sie Ihre Angaben.';
type Failure = 'network' | 'json' | 'timeout' | 'validation' | 'idempotency_conflict';

async function failRequest(locale: PublicLocale, failure: Failure) {
  const error = vi.fn();
  const clear = vi.fn();
  const receipt = vi.fn();
  const sending = vi.fn();
  const submission = {idempotencyKey: 'synthetic-retry-key', message: 'Synthetic test only'};
  const fetch = vi.fn(async (_path: string, _init: RequestInit) => {
    if (failure === 'network') throw new TypeError('Failed to fetch https://internal.invalid/raw-diagnostic');
    if (failure === 'timeout') throw new DOMException('Synthetic abort', 'AbortError');
    return {ok: false, json: async () => {
      if (failure === 'json') throw new SyntaxError('Unexpected HTML proxy diagnostic');
      return {error: {code: failure, message: validationText}};
    }};
  });
  const context = {
    sending: () => false, receipt: () => '', privacy: () => true,
    setSending: sending, setError: error, setStatus: vi.fn(), setReceipt: receipt, setDirty: vi.fn(),
    AbortController, Error, TypeError, SyntaxError, setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
    activeRequest: null, inquiryDraftMemory: {prepareSubmission: vi.fn(() => submission), clear},
    requestData: () => ({}), website: () => '', createRequestId: vi.fn(), fetch, portalHeader,
    locale: () => locale, t: (text: string) => publicText(text, locale), publicApiError,
    sendRequest: undefined as (() => Promise<void>) | undefined,
  };
  runInNewContext(output, context);
  await context.sendRequest!();
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe('/api/leads');
  expect(clear).not.toHaveBeenCalled();
  expect(receipt).not.toHaveBeenCalled();
  expect(sending.mock.calls).toEqual([[true], [false]]);
  return error.mock.calls.at(-1)?.[0];
}

describe('inquiry request failures preserve localized retry and validation guidance', () => {
  for (const locale of ['de', 'en', 'pl', 'lt', 'ru', 'uk'] as const) {
    it.each(['network', 'json'] as const)(`${locale}: replaces raw %s diagnostics with localized retry text`, async failure => {
      expect(await failRequest(locale, failure)).toBe(publicText(retryText, locale));
    });
    it(`${locale}: keeps the distinct timeout and retry guidance`, async () => {
      expect(await failRequest(locale, 'timeout')).toBe(publicText(timeoutText, locale));
    });
    it.each(['validation', 'idempotency_conflict'] as const)(`${locale}: retains mapped %s feedback`, async failure => {
      expect(await failRequest(locale, failure)).toBe(publicApiError(failure, locale, validationText));
    });
  }
});
