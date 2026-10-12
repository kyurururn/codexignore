import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';

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
  if (realpathSync(directory) !== realpathSync(packageRoot)) {
    for (const name of ['package.json', 'bin', 'src', '.codexignore.example']) cpSync(path.join(packageRoot, name), path.join(directory, name), { recursive: true });
  }
  // Node's spawn resolves the original PATH executable, not shell functions.
  const hook = `${begin}\nunalias codex 2>/dev/null || true\nfunction codex {\n  command node ${quote(path.join(directory, 'bin', 'auto.js'))} "$@"\n}\n${end}\n`;
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
