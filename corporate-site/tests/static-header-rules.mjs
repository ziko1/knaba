/**
 * Read static _headers by exact route scope, never by a broad substring.
 */
export function parseStaticHeaderRules(source) {
  if (typeof source !== 'string') throw new TypeError('header source must be text');
  const rules = new Map();
  let current = null;
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^[\t ]/.test(line)) {
      const path = line.trim();
      if (!path.startsWith('/')) throw new Error('Invalid header route: ' + path);
      if (rules.has(path)) throw new Error('Duplicate header route: ' + path);
      current = path;
      rules.set(path, []);
    } else {
      if (current === null) throw new Error('Header directive without route');
      if (!/^[\t ]+[^:\s]+:\s*.+$/.test(line)) throw new Error('Malformed header directive');
      rules.get(current).push(line.trim());
    }
  }
  if (!rules.has('/*')) throw new Error('Missing top-level header rule');
  return rules;
}
