import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { profileToml } from './rules.js';

export function sandboxArgs(root, rules, codexHome, command, cwd = root) {
  const profile = 'codexignore_' + randomBytes(8).toString('hex');
  return ['sandbox', '--include-managed-config', '-C', cwd, '-P', profile,
    '-c', `permissions.${profile}=${profileToml(root, rules, codexHome)}`, '--', ...command];
}

export function prepare(root, rules, args, platform = process.platform, { cwd = root } = {}) {
  if (platform !== 'darwin') throw new Error('automatic startup currently supports macOS only; other platforms require separate enforcement tests');
  const codexHome = realpathSync(process.env.CODEX_HOME || path.join(homedir(), '.codex'));
  const homeRelative = path.relative(root, codexHome);
  if (!homeRelative || !homeRelative.startsWith('..' + path.sep) && homeRelative !== '..' && !path.isAbsolute(homeRelative)) {
    throw new Error('CODEX_HOME must be outside the workspace so its state-write grant cannot reopen denied paths');
  }
  if (/[?*\[\]{}]/.test(root + codexHome)) throw new Error('workspace and CODEX_HOME paths must not contain glob metacharacters');
  const result = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Codex CLI is not available on PATH');
  const version = result.stdout.match(/codex-cli (\d+)\.(\d+)\.(\d+)/);
  if (!version || Number(version[1]) === 0 && Number(version[2]) < 162) throw new Error('Codex CLI >= 0.162.0 is required');
  const command = ['codex', '--no-daemon', '--ask-for-approval', 'never', ...args];
  return { codexHome, args: sandboxArgs(root, rules, codexHome, command, cwd), version: version[0] };
}

export async function launch(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', args, { stdio: 'inherit' });
    const handlers = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => {
      const handler = () => child.kill(signal);
      process.on(signal, handler);
      return [signal, handler];
    }));
    const cleanup = () => handlers.forEach((handler, signal) => process.off(signal, handler));
    child.on('error', error => { cleanup(); reject(error); });
    child.on('exit', (code, signal) => { cleanup(); resolve(code ?? (signal === 'SIGINT' ? 130 : 1)); });
  });
}
