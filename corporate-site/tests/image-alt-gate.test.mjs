import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertImageAlternatives} from '../scripts/image-alt-gate.mjs';

const document = body => `<!doctype html><html lang="de"><body>${body}</body></html>`;

test('informative localized image with dimensions is accepted', () => {
  assert.deepEqual(assertImageAlternatives(document(
    '<img src="/art/clean.svg" alt="Baureinigung" width="720" height="500">'
  )), {images:1, decorativeImages:0});
});

test('decorative carousel image is hidden from accessibility tree', () => {
  assert.deepEqual(assertImageAlternatives(document(
    '<div class="slide-art" aria-hidden="true"><picture><img alt="" width="960" height="550"></picture></div>'
  )), {images:1, decorativeImages:1});
});

test('aria-hidden propagates to nested decorative markup', () => {
  assert.deepEqual(assertImageAlternatives(document(
    '<section aria-hidden="true"><div aria-hidden="false"><img alt="" width="960" height="550"></div></section>'
  )), {images:1, decorativeImages:1});
});

test('missing alt attribute remains a release blocker', () => {
  assert.throws(() => assertImageAlternatives(document(
    '<img src="/art/clean.svg" width="960" height="550">'
  )), /missing alt attribute/);
});

test('unhidden blank alt remains a release blocker for this site', () => {
  assert.throws(() => assertImageAlternatives(document(
    '<img src="/art/clean.svg" alt="" width="960" height="550">'
  )), /aria-hidden subtree/);
});

test('missing or invalid intrinsic dimensions remain release blockers', () => {
  for (const tag of ['<img alt="Clean" height="550">', '<img alt="Clean" width="960" height="0">']) {
    assert.throws(() => assertImageAlternatives(document(tag)), /missing positive/);
  }
});

test('rejects unbounded input', () => {
  assert.throws(() => assertImageAlternatives('x'.repeat(5_000_001)), /INVALID_HTML_INPUT/);
});


test('noscript fallback image without alt must fail even with JavaScript disabled', () => {
  assert.throws(() => assertImageAlternatives(document(
    '<noscript><img src="/fallback.svg" width="960" height="550"></noscript>'
  )), /missing alt attribute/);
});

test('template image descendants retain the same alt contract', () => {
  assert.throws(() => assertImageAlternatives(document(
    '<template><img src="/template.svg" alt="" width="960" height="550"></template>'
  )), /aria-hidden subtree/);
});
