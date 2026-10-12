import path from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';
import { loadRules } from './rules.js';
import { prepare, launch } from './launcher.js';

export function selectDirectory(args, cwd) {
  const forwarded = [];
  let selected = cwd;
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--') { forwarded.push(...args.slice(i)); break; }
    if (value === '-C' || value === '--cd') {
      if (!args[i + 1]) throw new Error(`${value} requires a directory`);
      selected = path.resolve(cwd, args[++i]);
    } else if (value.startsWith('--cd=')) selected = path.resolve(cwd, value.slice(5));
    else if (value.startsWith('-C') && value.length > 2) selected = path.resolve(cwd, value.slice(2));
    else forwarded.push(value);
  }
  return { cwd: realpathSync(selected), args: forwarded };
}

export function findIgnoreRoot(cwd) {
  let candidate = realpathSync(cwd);
  while (true) {
    try { lstatSync(path.join(candidate, '.codexignore')); return candidate; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { lstatSync(path.join(candidate, '.git')); return null; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

export function validateAutoArgs(args) {
  const flags = new Set(['--json', '--search', '--no-alt-screen', '--oss', '--ephemeral', '--skip-git-repo-check']);
  const values = new Set(['--model', '-m', '--image', '-i', '--local-provider', '--color', '--output-last-message', '-o', '--output-schema']);
  const commands = new Set(['resume', 'fork', 'app', 'app-server', 'remote-control', 'cloud', 'sandbox', 'exec-server', 'review', 'agents', 'queue']);
  let positional = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') return;
    if (flags.has(arg)) continue;
    const equal = arg.indexOf('=');
    if (equal > 0 && values.has(arg.slice(0, equal))) continue;
    if (values.has(arg)) {
      if (!args[++i]) throw new Error(`${arg} requires a value`);
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`${arg} is not supported with .codexignore; refusing to start without protection`);
    if (!positional && arg === 'exec') continue;
    if (!positional && commands.has(arg)) throw new Error(`${arg} is not supported with .codexignore yet`);
    positional = true;
  }
}

export async function startAutomatic(args, cwd = process.cwd()) {
  if (['--help', '-h', '--version', '-V', 'login', 'logout', 'completion', 'update'].includes(args[0])) return launch(args);
  const selected = selectDirectory(args, cwd);
  const root = findIgnoreRoot(selected.cwd);
  if (!root) return launch(args);
  const loaded = loadRules(root);
  validateAutoArgs(selected.args);
  const prepared = prepare(root, loaded.rules, selected.args, process.platform, { cwd: selected.cwd });
  console.error(`codexignore: loaded ${root}/.codexignore (${loaded.rules.length} rules)`);
  return launch(prepared.args);
}
