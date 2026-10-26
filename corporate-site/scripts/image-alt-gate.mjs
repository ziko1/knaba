import assert from 'node:assert/strict';
import {parse} from 'parse5';

/**
 * Check built HTML image alternatives using an actual DOM tree.
 * Empty alt is allowed only in a deliberately aria-hidden subtree;
 * informative images must have a non-blank alt and dimensions.
 */
export function assertImageAlternatives(html, label = 'page') {
  if (typeof html !== 'string' || html.length > 5_000_000)
    throw new TypeError('INVALID_HTML_INPUT');
  const document = parse(html);
  let images = 0;
  let decorativeImages = 0;

  function visit(node, hidden = false) {
    const attrs = new Map((node.attrs || []).map(({name, value}) => [name, value]));
    const subtreeHidden = hidden || attrs.get('aria-hidden') === 'true';
    if (node.tagName === 'img') {
      images++;
      assert.ok(attrs.has('alt'), `${label}: image missing alt attribute`);
      const alt = attrs.get('alt');
      if (!alt?.trim()) {
        assert.ok(subtreeHidden, `${label}: empty alt must be in aria-hidden subtree`);
        decorativeImages++;
      }
      for (const name of ['width', 'height']) {
        assert.match(attrs.get(name) || '', /^[1-9][0-9]*$/, `${label}: image missing positive ${name}`);
      }
    }
    for (const child of node.childNodes || []) visit(child, subtreeHidden);
    if (node.content) visit(node.content, subtreeHidden);
  }
  visit(document);
  return {images, decorativeImages};
}
