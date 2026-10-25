import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseStaticHeaderRules} from './static-header-rules.mjs';

test('public scope stays indexable while private admin can be noindex', () => {
  const parsed = parseStaticHeaderRules([
    '/*', '  X-Content-Type-Options: nosniff',
    '/admin/*', '  X-Robots-Tag: noindex, nofollow', '  Cache-Control: private, no-store',
    '/konto/*', '  X-Robots-Tag: noindex, nofollow', ''
  ].join('\n'));
  assert.deepEqual(parsed.get('/*'), ['X-Content-Type-Options: nosniff']);
  assert.ok(!parsed.get('/*').some(line => /^X-Robots-Tag:\s*noindex\b/i.test(line)));
  assert.ok(parsed.get('/admin/*').includes('X-Robots-Tag: noindex, nofollow'));
  assert.ok(parsed.get('/admin/*').includes('Cache-Control: private, no-store'));
});

test('wildcard noindex is detected independently of private rules', () => {
  const parsed = parseStaticHeaderRules([
    '/*', '  X-Robots-Tag: noindex, follow',
    '/admin/*', '  X-Robots-Tag: noindex, nofollow', ''
  ].join('\n'));
  assert.match(parsed.get('/*').join('\n'), /^X-Robots-Tag: noindex, follow$/m);
});

test('invalid and duplicate scopes fail closed', () => {
  assert.throws(() => parseStaticHeaderRules(['/*','  X-Test: a','/*','  X-Test: b',''].join('\n')), /Duplicate/);
  assert.throws(() => parseStaticHeaderRules(['/*','  invalid',''].join('\n')), /Malformed/);
  assert.throws(() => parseStaticHeaderRules(['/admin/*','  X-Test: a',''].join('\n')), /Missing top-level/);
});
