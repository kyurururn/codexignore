import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { install, uninstall } from '../src/install.js';
import { selectDirectory, findIgnoreRoot, validateAutoArgs } from '../src/auto.js';

function fixture() {
  const base = mkdtempSync(path.join(tmpdir(), 'codexignore-auto-'));
  const home = path.join(base, 'home');
  const project = path.join(base, 'project');
  const bin = path.join(base, 'bin');
  for (const dir of [home, project, bin, path.join(home, '.codex'), path.join(project, 'nested')]) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}\nconst args=process.argv.slice(2); if(args[0]==='--version') console.log('codex-cli 0.162.1'); else console.log(JSON.stringify({args,cwd:process.cwd()}));\n`, { mode: 0o755 });
  return { base, home, project, bin };
}

test('installed zsh codex command automatically loads rules and forwards without recursion', () => {
  const f = fixture();
  try {
    const original = '# user settings\nexport EXISTING_SETTING=kept\n';
    writeFileSync(path.join(f.home, '.zshrc'), original);
    const options = { home: f.home, zdotdir: f.home, platform: 'darwin' };
    install(options);
    const config = readFileSync(path.join(f.home, '.zshrc'), 'utf8');
    install(options);
    assert.equal(readFileSync(path.join(f.home, '.zshrc'), 'utf8'), config);
    assert.equal(readFileSync(path.join(f.home, '.zshrc.codexignore-backup'), 'utf8'), original);
    const run = args => spawnSync('/bin/zsh', ['-dfc', 'source "$TEST_RC"; codex "$@"', 'fixture', ...args], {
      cwd: f.project, encoding: 'utf8', env: { ...process.env, HOME: f.home, CODEX_HOME: path.join(f.home, '.codex'), TEST_RC: path.join(f.home, '.zshrc'), PATH: f.bin + ':' + process.env.PATH }
    });
    let result = run(['hello']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).args, ['hello']);
    writeFileSync(path.join(f.project, '.codexignore'), '.env');
    if (process.platform === 'darwin') {
      result = run(['hello']);
      assert.equal(result.status, 0, result.stderr);
      const call = JSON.parse(result.stdout);
      assert.equal(call.args[0], 'sandbox');
      assert.match(call.args.join(' '), /\.env/);
      assert.match(result.stderr, /loaded.*\.codexignore/);
      result = run(['-C', 'nested', 'exec', '--json', 'Review this']);
      assert.equal(result.status, 0, result.stderr);
      const nested = JSON.parse(result.stdout).args;
      assert.equal(nested[nested.indexOf('-C') + 1], path.join(f.project, 'nested').replace(/^\/var\//, '/private/var/'));
      assert.ok(!nested.slice(nested.indexOf('--') + 1).includes('-C'));
    }
    assert.equal(run(['--version']).stdout.trim(), 'codex-cli 0.162.1');
    writeFileSync(path.join(f.project, '.codexignore'), '!bad');
    assert.notEqual(run([]).status, 0);
    uninstall(options);
    assert.equal(readFileSync(path.join(f.home, '.zshrc'), 'utf8'), original);
    assert.equal(existsSync(path.join(f.home, '.local', 'share', 'codexignore')), false);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('root discovery respects repository boundaries and directory selection', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.project, '.codexignore'), '.env');
    const selected = selectDirectory(['--cd=nested', 'exec', 'hello'], f.project);
    assert.deepEqual(selected.args, ['exec', 'hello']);
    assert.equal(findIgnoreRoot(selected.cwd), path.resolve(f.project).replace(/^\/var\//, '/private/var/'));
    mkdirSync(path.join(f.project, 'nested', '.git'));
    assert.equal(findIgnoreRoot(selected.cwd), null);
    assert.throws(() => validateAutoArgs(['--model', 'example', 'resume']), /not supported/);
    assert.throws(() => validateAutoArgs(['exec', 'resume']), /not supported/);
    validateAutoArgs(['hello']);
    validateAutoArgs(['exec', '--json', '--model=example', 'Review this']);
    assert.throws(() => validateAutoArgs(['--remote=ws://host']), /not supported/);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});
