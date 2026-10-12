import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseRules } from '../src/rules.js';
import { sandboxArgs } from '../src/launcher.js';
import { install } from '../src/install.js';

test('real Codex macOS sandbox blocks reads, writes and new matching files', {
  skip: process.env.CODEXIGNORE_SANDBOX_TEST !== '1' || process.platform !== 'darwin'
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'codexignore-test-'));
  const home = path.join(root, 'state');
  mkdirSync(home);
  mkdirSync(path.join(root, 'nested', 'secrets'), { recursive: true });
  mkdirSync(path.join(root, 'secrets'));
  mkdirSync(path.join(root, 'config'));
  for (const file of ['.env', 'nested/.env', 'nested/secrets/key', 'secrets/key', 'ordinary.txt']) writeFileSync(path.join(root, file), 'fixture');
  writeFileSync(path.join(root, 'config', 'x.key'), 'fixture');
  writeFileSync(path.join(home, 'config.toml'), '');
  writeFileSync(path.join(root, '.codexignore'), '.env\nsecrets/\n**/*.pem\nconfig/?.key');
  symlinkSync(path.join(root, '.env'), path.join(root, 'alias'));
  symlinkSync(path.join(root, 'ordinary.txt'), path.join(root, 'link.pem'));
  const rules = parseRules(readFileSync(path.join(root, '.codexignore'), 'utf8'));
  const run = script => spawnSync('codex', sandboxArgs(root, rules, home, ['/bin/sh', '-c', script]), { encoding: 'utf8' });
  try {
    const readable = run('cat ordinary.txt');
    assert.equal(readable.status, 0, readable.stderr);
    for (const script of ['cat .env', 'cat nested/.env', 'cat secrets/key', 'cat nested/secrets/key', 'cat alias', 'cat link.pem', 'cat config/x.key', 'printf changed > .env', 'rm .env', 'mv .env ordinary2.txt', 'printf new > new.pem', 'printf new > nested/new.pem', 'mkdir secrets/newdir', 'printf changed > .codexignore', 'printf changed > state/config.toml']) {
      const result = run(script);
      assert.notEqual(result.status, 0, `unexpected success: ${script}`);
    }
    assert.equal(run('printf ok > allowed.txt').status, 0);
    assert.equal(run('printf ok > state/session-fixture').status, 0);
    const cli = run('codex --no-daemon --ask-for-approval never --version');
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /codex-cli/);
    assert.equal(readFileSync(path.join(root, '.env'), 'utf8'), 'fixture');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('plain zsh codex invocation applies real sandbox denies automatically', {
  skip: process.env.CODEXIGNORE_SANDBOX_TEST !== '1' || process.platform !== 'darwin'
}, () => {
  const base = mkdtempSync(path.join(tmpdir(), 'codexignore-native-auto-'));
  const home = path.join(base, 'home');
  const project = path.join(base, 'project');
  const bin = path.join(base, 'bin');
  const original = spawnSync('/bin/zsh', ['-dfc', 'command -v codex'], { encoding: 'utf8' }).stdout.trim();
  assert.ok(original);
  try {
    for (const dir of [path.join(home, '.codex'), project, bin]) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(project, '.codexignore'), '.env');
    writeFileSync(path.join(project, '.env'), 'fixture');
    writeFileSync(path.join(project, 'ordinary'), 'allowed');
    writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === '--version') console.log('codex-cli 0.162.1');
else if (args[0] === 'sandbox') {
  const child = cp.spawnSync(${JSON.stringify(original)}, args, { stdio: 'inherit' });
  process.exit(child.status ?? 1);
} else {
  if (!args.includes('--no-daemon')) throw new Error('missing enforced startup flags');
  for (const attempt of [() => fs.readFileSync('.env'), () => fs.writeFileSync('.env', 'changed')]) {
    let denied = false;
    try { attempt(); } catch (error) { if (['EPERM','EACCES'].includes(error.code)) denied = true; else throw error; }
    if (!denied) throw new Error('secret access was allowed');
  }
  if (fs.readFileSync('ordinary', 'utf8') !== 'allowed') throw new Error('ordinary read failed');
  fs.writeFileSync('ordinary', 'updated');
  console.log('AUTOMATIC_SANDBOX_PASS');
}
`, { mode: 0o755 });
    install({ home, zdotdir: home, platform: 'darwin' });
    const result = spawnSync('/bin/zsh', ['-dfc', 'source "$TEST_RC"; codex'], {
      cwd: project, encoding: 'utf8', env: { ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex'), TEST_RC: path.join(home, '.zshrc'), PATH: bin + ':' + process.env.PATH }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AUTOMATIC_SANDBOX_PASS/);
    assert.match(result.stderr, /loaded.*\.codexignore/);
    assert.equal(readFileSync(path.join(project, '.env'), 'utf8'), 'fixture');
    assert.equal(readFileSync(path.join(project, 'ordinary'), 'utf8'), 'updated');
  } finally { rmSync(base, { recursive: true, force: true }); }
});
