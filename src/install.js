import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, renameSync } from 'node:fs';
import { activatePackage, compareVersions, packageVersion } from './update.js';

const begin = '# >>> codexignore >>>';
const end = '# <<< codexignore <<<';
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

export function removeHook(text) {
  if (!text.includes(begin) && !text.includes(end)) return text;
  if (text.split(begin).length !== 2 || text.split(end).length !== 2) throw new Error('ambiguous codexignore shell hook; inspect .zshrc');
  const first = text.indexOf(begin);
  const last = text.indexOf(end);
  if (last < first) throw new Error('invalid codexignore shell hook');
  return text.slice(0, first) + text.slice(last + end.length).replace(/^\r?\n/, '');
}

function locations(home, zdotdir) {
  const rc = path.join(zdotdir || home, '.zshrc');
  const directory = path.join(home, '.local', 'share', 'codexignore');
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) throw new Error('installation directory must not be a symlink');
  if (existsSync(directory) && JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).name !== 'codexignore') throw new Error('installation directory is not owned by codexignore');
  if (existsSync(rc) && lstatSync(rc).isSymbolicLink()) throw new Error('.zshrc is a symlink; install the hook manually');
  return { rc, directory };
}

export function install({ home = homedir(), zdotdir = process.env.ZDOTDIR, platform = process.platform } = {}) {
  if (platform !== 'darwin') throw new Error('automatic integration currently supports macOS and zsh only');
  const { rc, directory } = locations(home, zdotdir);
  const original = existsSync(rc) ? readFileSync(rc, 'utf8') : '';
  const base = removeHook(original);
  mkdirSync(directory, { recursive: true });
  const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const current = path.join(directory, 'current');
  const releases = path.join(directory, 'releases');
  if (existsSync(releases) && lstatSync(releases).isSymbolicLink()) throw new Error('release directory must not be a symlink');
  if (!existsSync(current) || compareVersions(packageVersion(realpathSync(current)), metadata.version) < 0) {
    activatePackage(directory, packageRoot, metadata.version);
  }
  mkdirSync(path.join(directory, 'bin'), { recursive: true });
  for (const name of ['auto.js', 'codexignore.js']) {
    const launcher = `#!/usr/bin/env node\nimport { realpathSync } from 'node:fs';\nimport { pathToFileURL } from 'node:url';\nconst release = realpathSync(new URL('../current', import.meta.url));\nawait import(pathToFileURL(release + '/bin/${name}').href);\n`;
    const target = path.join(directory, 'bin', name);
    writeFileSync(target + '.tmp', launcher, { mode: 0o755 });
    renameSync(target + '.tmp', target);
  }
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'codexignore', type: 'module', installationFormat: 1 }) + '\n');
  // Node's spawn resolves the original PATH executable, not shell functions.
  const hook = `${begin}\nunalias codex 2>/dev/null || true\nunalias codexignore 2>/dev/null || true\nfunction codex {\n  command node ${quote(path.join(directory, 'bin', 'auto.js'))} "$@"\n}\nfunction codexignore {\n  command node ${quote(path.join(directory, 'bin', 'codexignore.js'))} "$@"\n}\n${end}\n`;
  const updated = base + (base && !base.endsWith('\n') ? '\n' : '') + hook;
  mkdirSync(path.dirname(rc), { recursive: true });
  if (updated !== original) {
    if (existsSync(rc) && !existsSync(rc + '.codexignore-backup')) writeFileSync(rc + '.codexignore-backup', original, { flag: 'wx', mode: 0o600 });
    writeFileSync(rc, updated, { mode: 0o600 });
  }
  return { rc, directory };
}

export function uninstall({ home = homedir(), zdotdir = process.env.ZDOTDIR } = {}) {
  const { rc, directory } = locations(home, zdotdir);
  if (existsSync(rc)) {
    const original = readFileSync(rc, 'utf8');
    const updated = removeHook(original);
    if (updated !== original) writeFileSync(rc, updated);
  }
  rmSync(directory, { recursive: true, force: true });
  return { rc, directory };
}
