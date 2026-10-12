import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { install } from '../src/install.js';
import { activatePackage, extractArchive, selectRelease, update } from '../src/update.js';

const source = fileURLToPath(new URL('../', import.meta.url));
function fixture() {
  const base = mkdtempSync(path.join(tmpdir(), 'codexignore-update-'));
  const home = path.join(base, 'home');
  mkdirSync(home);
  const rc = path.join(home, '.zshrc');
  writeFileSync(rc, '# keep my configuration\n');
  install({ home, zdotdir: home, platform: 'darwin' });
  const root = path.join(home, '.local', 'share', 'codexignore');
  const packageRoot = path.join(base, 'package');
  mkdirSync(packageRoot);
  for (const name of ['package.json', 'bin', 'src', '.codexignore.example', 'README.md']) cpSync(path.join(source, name), path.join(packageRoot, name), { recursive: true });
  const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  metadata.version = '0.4.1';
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify(metadata));
  const archivePath = path.join(base, 'release.tgz');
  const tar = spawnSync('tar', ['-czf', archivePath, '-C', base, 'package'], { encoding: 'utf8' });
  assert.equal(tar.status, 0, tar.stderr);
  const archive = readFileSync(archivePath);
  const checksum = createHash('sha256').update(archive).digest('hex') + '  codexignore-0.4.1.tgz\n';
  const url = 'https://github.com/kyurururn/codexignore/releases/download/v0.4.1/';
  const release = { tag_name: 'v0.4.1', prerelease: true, draft: false, assets: ['codexignore-0.4.1.tgz', 'SHA256SUMS'].map(name => ({ name, browser_download_url: url + name })) };
  const fetchImpl = async requested => {
    if (requested.startsWith('https://api.github.com/')) return new Response(JSON.stringify([release]));
    if (requested.endsWith('SHA256SUMS')) return new Response(checksum);
    assert.equal(requested, url + 'codexignore-0.4.1.tgz');
    return new Response(archive);
  };
  return { base, home, rc, root, packageRoot, archivePath, fetchImpl, release };
}

test('one-command update activates a verified release and keeps configuration and launchers', async () => {
  const f = fixture();
  try {
    const settings = readFileSync(f.rc, 'utf8');
    const launcher = readFileSync(path.join(f.root, 'bin/auto.js'), 'utf8');
    const oldRelease = realpathSync(path.join(f.root, 'current'));
    const project = path.join(f.base, 'project');
    mkdirSync(project);
    writeFileSync(path.join(project, '.codexignore'), '.env\n');
    assert.deepEqual(await update({ root: f.root, fetchImpl: f.fetchImpl }), { updated: true, version: '0.4.1', previousVersion: '0.4.0' });
    assert.notEqual(realpathSync(path.join(f.root, 'current')), oldRelease);
    assert.ok(existsSync(oldRelease));
    assert.equal(readFileSync(f.rc, 'utf8'), settings);
    assert.equal(readFileSync(path.join(project, '.codexignore'), 'utf8'), '.env\n');
    assert.equal(readFileSync(path.join(f.root, 'bin/auto.js'), 'utf8'), launcher);
    const run = spawnSync('/bin/zsh', ['-dfc', 'source "$TEST_RC"; codexignore --version'], { encoding: 'utf8', env: { ...process.env, HOME: f.home, TEST_RC: f.rc } });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), '0.4.1');
    // The old globally installed entrypoint also resolves the managed version.
    const global = spawnSync(process.execPath, [path.join(source, 'bin/codexignore.js'), '--version'], { encoding: 'utf8', env: { ...process.env, HOME: f.home } });
    assert.equal(global.status, 0, global.stderr);
    assert.equal(global.stdout.trim(), '0.4.1');
    assert.deepEqual(await update({ root: f.root, fetchImpl: f.fetchImpl }), { updated: false, version: '0.4.1' });
    install({ home: f.home, zdotdir: f.home, platform: 'darwin' });
    assert.equal(JSON.parse(readFileSync(path.join(f.root, 'current/package.json'), 'utf8')).version, '0.4.1');
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('network, checksum, incomplete release and activation failures keep the previous version', async () => {
  const f = fixture();
  try {
    const original = realpathSync(path.join(f.root, 'current'));
    const cases = [
      { fetchImpl: async () => { throw new Error('offline'); }, match: /offline/ },
      { fetchImpl: async url => url.endsWith('SHA256SUMS') ? new Response('0'.repeat(64) + '  codexignore-0.4.1.tgz') : f.fetchImpl(url), match: /checksum does not match/ },
      { fetchImpl: async () => new Response(JSON.stringify([{ ...f.release, assets: [] }])), match: /missing/ },
      { fetchImpl: f.fetchImpl, beforeSwitch: () => { throw new Error('cannot activate'); }, match: /cannot activate/ }
    ];
    for (const options of cases) {
      await assert.rejects(update({ root: f.root, ...options }), options.match);
      assert.equal(realpathSync(path.join(f.root, 'current')), original);
      assert.ok(!existsSync(path.join(f.root, '.update-lock')));
      assert.ok(!readdirSync(f.root).some(name => name.startsWith('.update-')));
    }
    mkdirSync(path.join(f.root, '.update-lock'));
    await assert.rejects(update({ root: f.root, fetchImpl: f.fetchImpl }), /another update/);
    assert.ok(existsSync(path.join(f.root, '.update-lock')));
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('archive links and wrong package versions cannot be activated', () => {
  const f = fixture();
  try {
    const original = realpathSync(path.join(f.root, 'current'));
    assert.throws(() => activatePackage(f.root, f.packageRoot, '0.5.0'), /does not match/);
    symlinkSync('/etc/passwd', path.join(f.packageRoot, 'src/linked.js'));
    const archive = path.join(f.base, 'unsafe.tgz');
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', f.base, 'package']).status, 0);
    assert.throws(() => extractArchive(archive, f.base), /links or special files/);
    assert.equal(realpathSync(path.join(f.root, 'current')), original);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('release selection includes experimental releases and ignores drafts and invalid tags', () => {
  assert.equal(selectRelease([{ tag_name: 'v0.4.0' }, { tag_name: 'v0.5.0', prerelease: true }, { tag_name: 'v9.0.0', draft: true }, { tag_name: 'v0.6.0-rc.1' }]).tag_name, 'v0.5.0');
});
