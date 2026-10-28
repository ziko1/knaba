import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import ts from 'typescript';

// Only the retired pre-BauService template families are eligible. Their source
// rules stay in global.css; active components, private UI and generic utility
// classes are never candidates. Reusing a name in runtime source restores it.
export const legacyStyleCandidates = Object.freeze([
  'brand-mark', 'brand-type', 'hero-copy', 'hero-description', 'hero-actions',
  'hero-notes', 'hero-visual', 'small-line', 'image-label', 'label-icon',
  'photo-note', 'visual-corner', 'trust-band', 'hero-pill', 'hero-highlight',
  'hero-spark', 'hero-art', 'art-caption', 'tiny-cross', 'office-art', 'art-tag',
  'art-round-link', 'art-credit', 'service-grid', 'service-card', 'service-card-top',
  'service-icon', 'service-number', 'service-card-bottom', 'approach-grid',
  'principles', 'region-section', 'region-graphic', 'map-grid', 'map-orbit',
  'orbit-two', 'map-center', 'map-caption', 'region-copy', 'faq-section',
  'faq-list', 'related-links', 'sector-grid', 'planner-banner', 'planner-copy',
  'planner-footnote', 'plan-preview', 'plan-preview-top', 'plan-mini-logo',
  'plan-preview-dot', 'plan-preview-title', 'plan-preview-row', 'plan-check',
  'plan-step', 'preview-banner', 'preview-dot', 'preview-footer', 'preview-domain',
]);

const runtimeExtensions = new Set([
  '.astro', '.vue', '.svelte', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.html', '.md', '.mdx', '.svg',
]);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const dynamicToken = '\0';

// Parse a bounded class value, accepting trailing template markup but never
// a syntax error inside the value itself. TypeScript is already a build tool.
function leadingExpression(text) {
  const source = ts.createSourceFile('class-usage.tsx', 'const classValue = ' + text.slice(0, 4096), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = source.statements[0];
  const value = statement && ts.isVariableStatement(statement) ? statement.declarationList.declarations[0]?.initializer : undefined;
  return value && !source.parseDiagnostics.some(error => error.start < value.end) ? value : null;
}

function combine(left, right) {
  if (!left || !right || left.length * right.length > 64) return null;
  return left.flatMap(a => right.map(b => a + b));
}

function classPatterns(node) {
  if (!node) return null;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return classPatterns(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return [''];
  if (ts.isConditionalExpression(node)) {
    const yes = classPatterns(node.whenTrue), no = classPatterns(node.whenFalse);
    return yes && no ? [...yes, ...no] : null;
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return classPatterns(node.right);
    if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      const left = classPatterns(node.left), right = classPatterns(node.right);
      return left && right ? [...left, ...right] : null;
    }
    if (operator === ts.SyntaxKind.PlusToken) return combine(classPatterns(node.left) || [dynamicToken], classPatterns(node.right) || [dynamicToken]);
    return null;
  }
  if (ts.isTemplateExpression(node)) {
    let result = [node.head.text];
    for (const span of node.templateSpans) {
      result = combine(result, classPatterns(span.expression) || [dynamicToken]);
      result = combine(result, [span.literal.text]);
    }
    return result;
  }
  if (ts.isArrayLiteralExpression(node)) {
    const items = node.elements.map(classPatterns);
    return items.some(item => !item) ? null : items.flat();
  }
  if (ts.isObjectLiteralExpression(node)) {
    const keys = [];
    for (const property of node.properties) {
      if (!(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) ||
          !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) return null;
      keys.push(property.name.text);
    }
    return keys;
  }
  return null;
}

/** @param {string[]} sources */
export function unusedLegacyStylesInSources(sources) {
  if (!Array.isArray(sources) || !sources.length || sources.some(source => typeof source !== 'string')) return [];
  // Component style blocks declare rules, not runtime usage. Everything else
  // counts, including selectors, JSON, classList calls, comments and copy.
  const text = sources.map(source => source.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')).join('\n');
  const tokens = new Set(text.match(/[\w-]+/g) || []);
  const patterns = [];
  // Inspect class-writing expressions rather than unrelated API strings.
  // Unknown computed class names disable pruning, while literal fragments keep
  // the entire possible family (e.g. `hero-${kind}` or 'service-' + kind).
  const expressions = [];
  for (const matcher of [
    /\b(?:class|className|classList|class:list)\s*=\s*\{/g,
    /\.className\s*=\s*/g,
    /\.setAttribute\(\s*['"]class['"]\s*,\s*/g,
  ]) {
    for (const match of text.matchAll(matcher)) expressions.push(leadingExpression(text.slice(match.index + match[0].length)));
  }
  for (const match of text.matchAll(/:class\s*=\s*(["'])(.*?)\1/g)) expressions.push(leadingExpression(match[2]));
  for (const match of text.matchAll(/\.classList\.(add|toggle|replace)\s*\(/g)) {
    const call = leadingExpression('classes(' + text.slice(match.index + match[0].length));
    if (!call || !ts.isCallExpression(call)) return [];
    expressions.push(...Array.from(call.arguments).slice(0, match[1] === 'toggle' ? 1 : undefined));
  }
  for (const expression of expressions) {
    const values = classPatterns(expression);
    if (!values) return [];
    for (const value of values) {
      for (const token of value.split(/\s+/).filter(Boolean)) {
        // A bare unknown token could name any retired class. An anchored
        // prefix/suffix retains its entire possible class family.
        if (token.includes(dynamicToken) && !token.replaceAll(dynamicToken, '')) return [];
        const pattern = token.split(dynamicToken).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        patterns.push(new RegExp('^' + pattern + '$'));
      }
    }
  }
  return legacyStyleCandidates.filter(name => !tokens.has(name) &&
    !patterns.some(pattern => pattern.test(name)));
}

/** Read all local runtime emitters. An incomplete scan disables pruning. */
export function findUnusedLegacyStyleSymbols(root = projectRoot) {
  const sources = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Runtime symlink requires an explicit CSS usage review');
      if (entry.isDirectory()) visit(path);
      else if (runtimeExtensions.has(extname(entry.name)) && !/\.(?:test|spec)\./.test(entry.name)) {
        sources.push(readFileSync(path, 'utf8'));
      }
    }
  };
  try {
    for (const directory of ['src', 'worker', 'vps']) visit(join(root, directory));
    return unusedLegacyStylesInSources(sources);
  } catch {
    // Keeping every rule is the safe fallback; the unchanged size gate still
    // rejects an oversized release instead of removing unverified styles.
    return [];
  }
}

/** Independent generated-HTML guard, including decoded attributes/templates. */
export function assertNoPrunedClassesInHtml(html, unusedSymbols, file = 'HTML') {
  const pruned = new Set(unusedSymbols);
  const visit = node => {
    const classes = node.attrs?.find(attribute => attribute.name === 'class')?.value.split(/\s+/) || [];
    for (const name of classes) {
      if (pruned.has(name)) throw new Error(`${file}: active class ${name} was marked as unused CSS`);
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parse(html));
}
