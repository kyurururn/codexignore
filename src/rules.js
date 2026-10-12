import path from 'node:path';
import { readFileSync, realpathSync, statSync } from 'node:fs';

function globRegex(pattern) {
  let result = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { result += '(?:.*/)?'; i++; }
      else result += '.*';
    } else if (c === '*') result += '[^/]*';
    else if (c === '?') result += '[^/]';
    else result += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(result + '$', 'u');
}

export function parseRules(text) {
  const rules = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, index) => {
    const value = raw.trim();
    const fail = message => { throw new Error(`.codexignore:${index + 1}: ${message}`); };
    if (!value || value.startsWith('#')) return;
    if (value.startsWith('!')) fail('negation (!) is not supported');
    if (/[\\[\]{}\x00-\x1f\x7f]/u.test(value)) fail('escapes, character classes, braces and control characters are not supported');
    if (value.startsWith('~') || value.includes(':')) fail('use workspace-relative paths');
    const anchored = value.startsWith('/');
    const directory = value.endsWith('/');
    let pattern = value.replace(/^\//, '').replace(/\/$/, '');
    const segments = pattern.split('/');
    if (!pattern || segments.some(s => !s || s === '.' || s === '..')) fail('empty segments and . or .. are not allowed');
    if (segments.some(s => s.includes('**') && s !== '**')) fail('** must be a complete path segment');
    if (!anchored && !pattern.includes('/')) pattern = '**/' + pattern;
    rules.push({ line: index + 1, source: value, pattern, directory, regex: globRegex(pattern) });
  });
  return rules;
}

export function loadRules(root) {
  root = realpathSync(root);
  const file = path.join(root, '.codexignore');
  if (realpathSync(file) !== file || !statSync(file).isFile()) throw new Error('.codexignore must be a regular file, not a symlink');
  const rules = parseRules(readFileSync(file, 'utf8'));
  return { root, rules };
}

export function matchingRules(rules, relative) {
  const parts = relative.split('/');
  return rules.filter(rule => parts.some((_, i) => {
    return rule.regex.test(parts.slice(0, i + 1).join('/'));
  }));
}

export function denyPaths(root, rules) {
  const paths = new Set([path.join(root, '.codexignore')]);
  for (const rule of rules) {
    const absolute = root + '/' + rule.pattern;
    paths.add(absolute);
    // A matched directory must also deny all descendants.
    if (/[?*]/.test(rule.pattern)) paths.add(absolute + '/**');
  }
  return [...paths];
}

export const tomlString = value => JSON.stringify(value);

export function profileToml(root, rules, codexHome) {
  // Denies are absolute: workspace changes cannot re-anchor them.
  const entries = new Map([[codexHome, 'write']]);
  // Allow CLI session state, but protect its persistent configuration.
  for (const name of ['config.toml', 'requirements.toml', 'rules', 'hooks', 'skills', 'plugins']) entries.set(path.join(codexHome, name), 'read');
  for (const denied of denyPaths(root, rules)) entries.set(denied, 'deny');
  return `{ extends = ":workspace", network = { enabled = true }, filesystem = { ${[...entries].map(([p, access]) => `${tomlString(p)} = ${tomlString(access)}`).join(', ')} } }`;
}
