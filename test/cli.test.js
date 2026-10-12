import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/codexignore.js', import.meta.url));
test('CLI validates and explains manually created rules; no init or run needed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'codexignore-cli-'));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  try {
    assert.equal(run('check').status, 1);
    writeFileSync(path.join(root, '.codexignore'), '.env\nsecrets/');
    assert.equal(run('check').status, 0);
    assert.match(run('explain', 'nested/.env').stdout, /DENY .codexignore:1/);
    assert.match(run('explain', 'secrets/key').stdout, /DENY .codexignore:2/);
    assert.equal(run('explain', '../outside').status, 1);
    assert.equal(run('init').status, 1);
    assert.equal(run('run').status, 1);
    assert.match(run('--version').stdout, /^0\.4\.0/);
    writeFileSync(path.join(root, '.codexignore'), '# No rules yet');
    assert.equal(run('check').status, 0);
    writeFileSync(path.join(root, '.codexignore'), '!secret');
    assert.equal(run('check').status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
