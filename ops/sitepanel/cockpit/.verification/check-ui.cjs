'use strict';
// Dependency-free UI/CLI contract check. This is not a browser or a live authentication test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sourceRoot = path.resolve(__dirname, '../sitepanel');
const results = [];
const check = (name, fn) => { fn(); results.push(name); };

class Node {
  constructor(tag, doc) { this.tagName = tag.toLowerCase(); this.doc = doc; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.className = ''; this.text = ''; this.hidden = false; this.disabled = false; this.open = false; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); }
  set textContent(value) { this.text = String(value); this.replaceChildren(); }
  get textContent() { return this.text + this.children.map((node) => node.textContent).join(''); }
  get childElementCount() { return this.children.length; }
  get isConnected() { return this === this.doc.root || Boolean(this.parent?.isConnected); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = value; if (name === 'class') this.className = value; if (name.startsWith('data-')) this.dataset[name.slice(5)] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name) { for (const callback of this.listeners[name] || []) callback({ target: this, preventDefault() {} }); }
  querySelector(selector) { return walk(this).find((node) => matches(node, selector)) || null; }
  focus() { this.doc.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
function walk(node) { return node.children.flatMap((child) => [child, ...walk(child)]); }
function matches(node, selector) {
  const data = selector.match(/^\[data-([a-z]+)(?:="([^"]*)")?\]$/);
  if (data) return data[2] === undefined ? Object.hasOwn(node.dataset, data[1]) : node.dataset[data[1]] === data[2];
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
  return node.tagName === selector;
}
function documentFromHTML(html) {
  const doc = { createElement(tag) { return new Node(tag, doc); }, getElementById(id) { return walk(doc.root).find((node) => node.id === id) || null; }, querySelectorAll(selector) { return walk(doc.root).filter((node) => matches(node, selector)); } };
  doc.root = new Node('#document', doc);
  const stack = [doc.root];
  for (const token of html.match(/<!--[^]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([^\s/>]+)/)[1];
      const node = doc.createElement(tag);
      for (const item of token.slice(tag.length + 1).matchAll(/([a-zA-Z][\w-]*)(?:="([^"]*)")?/g)) {
        node.setAttribute(item[1], item[2] || '');
        if (item[1] === 'hidden') node.hidden = true;
      }
      stack.at(-1).append(node);
      if (!['meta', 'link', 'input', 'br', 'hr', 'img'].includes(tag)) stack.push(node);
    } else stack.at(-1).text += token;
  }
  doc.documentElement = walk(doc.root).find((node) => node.tagName === 'html');
  doc.body = walk(doc.root).find((node) => node.tagName === 'body');
  return doc;
}

const fixture = {
  ok: true, account: { name: 'knaba', display_name: 'KNABA', home: '/srv/knaba' }, scope: 'own-sites', checked_at: '2026-10-30T00:00:00Z',
  sites: [
    { id: 'knaba-production', label: 'KNABA website', domains: ['knaba.example.test'], url: 'https://knaba.example.test/', admin_url: 'https://knaba.example.test/login/', location: 'local', state: 'running', health: { status: 200 }, actions: ['start', 'restart', 'stop', 'backup'], note: null },
    { id: 'external-site', label: 'External site', domains: ['external.example.test'], url: null, admin_url: null, location: 'external', state: 'unknown', health: { status: null }, actions: [], note: null }
  ]
};
const doc = documentFromHTML(fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8'));
const storage = new Map();
const calls = [];
let catalog = structuredClone(fixture);
let transportFailure = false;
let backendFailure = null;
const context = {
  document: doc, navigator: { language: 'en-US' }, URL, Intl, Map, Set, Date, Uint8Array, JSON, Promise, Error, console,
  crypto: crypto.webcrypto, setTimeout, clearTimeout,
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  cockpit: {
    spawn(args, options) {
      calls.push({ args: [...args], options: { ...options } });
      let rejectProcess;
      const promise = new Promise((resolve, reject) => {
        rejectProcess = reject;
        setTimeout(() => {
          if (args[1] === 'catalog') { resolve(JSON.stringify(catalog)); return; }
          if (transportFailure) { transportFailure = false; reject({ message: 'password=NEVER_DISPLAY' }); return; }
          if (backendFailure) { resolve(JSON.stringify({ ok: false, error: { code: backendFailure, message: 'password=NEVER_DISPLAY' } })); return; }
          resolve(JSON.stringify({ ok: true, result: { state: 'completed', message: 'done' } }));
        }, args[1] === 'catalog' ? 1 : 30);
      });
      promise.close = () => rejectProcess({ problem: 'terminated' });
      return promise;
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'app.js'), 'utf8'), context);
const wait = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
const byId = (id) => doc.getElementById(id);
const action = (name) => doc.querySelectorAll('[data-action="' + name + '"]')[0];
const actionCalls = () => calls.filter((call) => call.args[1] === 'action');

(async () => {
  await wait();
  check('KNABA default language is German', () => assert.equal(doc.documentElement.lang, 'de'));
  check('Only supplied account and two site rows rendered', () => { assert.equal(byId('account-name').textContent, 'KNABA'); assert.equal(doc.querySelectorAll('.site-card').length, 2); });
  check('External null URL is not advertised as a working website', () => { const external = byId('site-external-site').parent.parent.parent; assert.equal(walk(external).some((node) => node.className === 'status status-running'), false); assert.equal(walk(external).some((node) => node.tagName === 'a' && node.textContent === 'Website öffnen'), false); });
  action('stop').dispatch('click');
  check('Stop opens confirmation without mutation', () => { assert.equal(byId('confirm-dialog').open, true); assert.equal(actionCalls().length, 0); });
  byId('confirm-cancel').dispatch('click');
  check('Cancel sends no mutation', () => { assert.equal(byId('confirm-dialog').open, false); assert.equal(actionCalls().length, 0); });
  action('restart').dispatch('click');
  byId('confirm-form').dispatch('submit');
  check('One confirmed mutation with exact command and valid UUID', () => { assert.equal(actionCalls().length, 1); assert.deepEqual(actionCalls()[0].args.slice(0, 4), ['/usr/local/bin/sitepanel', 'action', 'knaba-production', 'restart']); assert.match(actionCalls()[0].args[4], /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/); });
  check('No tenant argument or elevation requested', () => assert.deepEqual(actionCalls()[0].options, { err: 'message' }));
  check('Concurrent actions disabled', () => assert.equal(action('backup').disabled, true));
  await wait(50);
  check('Completion notice and refreshed catalog', () => { assert.match(byId('notice').textContent, /Neustart/); assert.equal(byId('refresh').disabled, false); });
  transportFailure = true;
  action('backup').dispatch('click');
  await wait(50);
  const uncertainId = actionCalls().at(-1).args[4];
  check('Transport error is honest and does not echo raw secrets', () => { assert.equal(doc.body.textContent.includes('NEVER_DISPLAY'), false); assert.match(byId('notice').textContent, /nicht bestätigt/); });
  action('backup').dispatch('click');
  await wait(50);
  check('Explicit retry reuses uncertain request UUID', () => assert.equal(actionCalls().at(-1).args[4], uncertainId));
  backendFailure = 'result_unknown';
  action('backup').dispatch('click');
  await wait(50);
  const backendUncertainId = actionCalls().at(-1).args[4];
  backendFailure = 'unavailable';
  action('backup').dispatch('click');
  await wait(50);
  check('result_unknown retains the request UUID', () => assert.equal(actionCalls().at(-1).args[4], backendUncertainId));
  backendFailure = null;
  action('backup').dispatch('click');
  await wait(50);
  check('unavailable also retains UUID until confirmed completion', () => assert.equal(actionCalls().at(-1).args[4], backendUncertainId));
  action('backup').dispatch('click');
  await wait(50);
  check('A later intentional action after completion receives a new UUID', () => assert.notEqual(actionCalls().at(-1).args[4], backendUncertainId));
  catalog.sites[0].label = '<img src=x onerror="window.XSS=true">';
  catalog.sites[0].admin_url = 'javascript:window.XSS=true';
  byId('refresh').dispatch('click');
  await wait();
  check('Untrusted label remains text; unsafe URL not linked', () => { assert.equal(byId('site-knaba-production').textContent, catalog.sites[0].label); assert.equal(doc.querySelectorAll('img').length, 0); assert.equal(doc.querySelectorAll('a').some((node) => node.href?.startsWith('javascript:')), false); });
  catalog.scope = 'all-sites';
  byId('refresh').dispatch('click');
  await wait();
  check('Invalid scope clears old catalog and account', () => { assert.equal(doc.querySelectorAll('.site-card').length, 0); assert.equal(byId('account-badge').hidden, true); assert.equal(byId('error-panel').hidden, false); });
  catalog = { ok: true, account: { name: 'vsp', display_name: 'VSP', home: '/srv/vsp' }, sites: [], checked_at: '2026-10-30T00:00:00Z', scope: 'own-sites' };
  byId('retry').dispatch('click');
  await wait();
  check('VSP account uses Ukrainian and has honest empty state', () => { assert.equal(doc.documentElement.lang, 'uk'); assert.equal(byId('empty-panel').hidden, false); assert.equal(byId('account-name').textContent, 'VSP'); });
  byId('language').value = 'en';
  byId('language').dispatch('change');
  check('English language choice stored only for this account', () => { assert.equal(byId('page-title').textContent, 'My websites'); assert.equal(storage.get('sitepanel.language.vsp'), 'en'); assert.equal(storage.has('sitepanel.language.knaba'), false); });
  const report = { result: 'PASS', scope: 'Dependency-free DOM and mocked Cockpit CLI contract; not a browser, not live authentication/authorization', checks: results, visual_browser: 'NOT RUN by this script: this is a DOM/CLI contract harness, not a browser rendering test', file_sha256: Object.fromEntries(['manifest.json', 'index.html', 'app.js', 'style.css'].map((name) => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceRoot, name))).digest('hex')])) };
  fs.writeFileSync(path.join(__dirname, 'ui-contract-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
