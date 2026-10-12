import path from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';

export const repository = 'kyurururn/codexignore';
const maxArchive = 10 * 1024 * 1024;
export const installationRoot = () => path.join(homedir(), '.local', 'share', 'codexignore');
export const packageVersion = root => JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

function versionParts(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`unsupported release version: ${version}`);
  return version.split('.').map(Number);
}
export function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
export function selectRelease(releases) {
  if (!Array.isArray(releases)) throw new Error('invalid GitHub release response');
  const candidates = releases.filter(r => !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name));
  candidates.sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)));
  if (!candidates.length) throw new Error('no published release found');
  return candidates[0];
}

export function assertInstallation(root) {
  if (!existsSync(root) || lstatSync(root).isSymbolicLink()) throw new Error('run codexignore install once before updating');
  const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (metadata.name !== 'codexignore' || metadata.installationFormat !== 1) throw new Error('this installation needs a one-time migration: install the new package and run codexignore install');
  const releases = path.join(root, 'releases');
  if (lstatSync(releases).isSymbolicLink()) throw new Error('release directory must not be a symlink');
  const current = realpathSync(path.join(root, 'current'));
  if (path.dirname(current) !== realpathSync(releases)) throw new Error('current release is outside the installation');
  return current;
}

export function validatePackage(root, expectedVersion) {
  const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (metadata.name !== 'codexignore' || metadata.version !== expectedVersion) throw new Error('downloaded package name or version does not match the release');
  versionParts(metadata.version);
  for (const name of ['bin/auto.js', 'bin/codexignore.js', 'src/update.js']) {
    if (!lstatSync(path.join(root, name)).isFile()) throw new Error(`package is missing ${name}`);
  }
}

// A single symlink rename selects a complete release. Already-running Node processes
// keep the modules they loaded; shell hooks continue to use the same launcher path.
export function activatePackage(root, source, version, beforeSwitch = () => {}) {
  validatePackage(source, version);
  const releases = path.join(root, 'releases');
  mkdirSync(releases, { recursive: true });
  const destination = path.join(releases, `${version}-${randomBytes(6).toString('hex')}`);
  const temporaryLink = path.join(root, `.current-${randomBytes(6).toString('hex')}`);
  try {
    mkdirSync(destination);
    for (const name of ['package.json', 'bin', 'src', '.codexignore.example', 'README.md']) {
      cpSync(path.join(source, name), path.join(destination, name), { recursive: true });
    }
    validatePackage(destination, version);
    symlinkSync(path.relative(root, destination), temporaryLink);
    beforeSwitch();
    renameSync(temporaryLink, path.join(root, 'current'));
  } catch (error) {
    rmSync(temporaryLink, { force: true });
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

async function download(url, limit, fetchImpl) {
  const accept = url.startsWith('https://api.github.com/') ? 'application/vnd.github+json' : 'application/octet-stream';
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'codexignore-updater', Accept: accept } });
  if (!response.ok) throw new Error(`download failed (HTTP ${response.status})`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('release download is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function verifyArchive(archive, checksumText, filename) {
  const lines = checksumText.trim().split(/\r?\n/);
  const matches = lines.map(line => line.match(/^([a-fA-F0-9]{64})\s+\*?([^\s]+)$/)).filter(match => match && match[2] === filename);
  if (matches.length !== 1) throw new Error('release checksum is missing or ambiguous');
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== matches[0][1].toLowerCase()) throw new Error('release checksum does not match; current version was kept');
}

export function extractArchive(archivePath, stage) {
  // Validate both paths and entry kinds before extraction. No links, traversal,
  // absolute paths or filenames outside the npm package allowlist are accepted.
  gunzipSync(readFileSync(archivePath), { maxOutputLength: 50 * 1024 * 1024 });
  const listing = spawnSync('tar', ['-tzf', archivePath], { encoding: 'utf8', maxBuffer: maxArchive, timeout: 30000 });
  const details = spawnSync('tar', ['-tvzf', archivePath], { encoding: 'utf8', maxBuffer: maxArchive, timeout: 30000 });
  if (listing.error || details.error || listing.status !== 0 || details.status !== 0) throw new Error('release archive could not be inspected');
  const entries = listing.stdout.trim().split('\n');
  if (!entries.length || entries.length > 100 || new Set(entries).size !== entries.length) throw new Error('invalid release archive entries');
  for (const entry of entries) {
    if (entry !== 'package/' && !/^package\/(?:bin\/[a-z-]+\.js|src\/[a-z-]+\.js|package\.json|README\.md|\.codexignore\.example|(?:bin|src)\/?)$/.test(entry)) throw new Error('unsafe path in release archive');
  }
  const kinds = details.stdout.trim().split('\n');
  if (kinds.length !== entries.length || kinds.some(line => !/^[-d]/.test(line))) throw new Error('links or special files are not allowed in release archives');
  const result = spawnSync('tar', ['-xzf', archivePath, '-C', stage], { encoding: 'utf8', timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error('release archive could not be extracted');
  return path.join(stage, 'package');
}

export async function update({ root = installationRoot(), fetchImpl = fetch, beforeSwitch } = {}) {
  assertInstallation(root);
  const lock = path.join(root, '.update-lock');
  try { mkdirSync(lock); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('another update is in progress; if it was interrupted, remove ~/.local/share/codexignore/.update-lock and retry'); throw error; }
  let stage;
  try {
    const current = assertInstallation(root);
    const data = await download(`https://api.github.com/repos/${repository}/releases?per_page=100`, 1024 * 1024, fetchImpl);
    // Include published Pre-releases while the project is experimental.
    const release = selectRelease(JSON.parse(data.toString('utf8')));
    const version = release.tag_name.slice(1);
    const installed = packageVersion(current);
    if (compareVersions(version, installed) <= 0) return { updated: false, version: installed };
    const filename = `codexignore-${version}.tgz`;
    const base = `https://github.com/${repository}/releases/download/${release.tag_name}/`;
    for (const name of [filename, 'SHA256SUMS']) {
      if (!release.assets?.some(asset => asset.name === name && asset.browser_download_url === base + name)) throw new Error(`release is missing ${name}; current version was kept`);
    }
    const checksum = await download(base + 'SHA256SUMS', 4096, fetchImpl);
    const archive = await download(base + filename, maxArchive, fetchImpl);
    verifyArchive(archive, checksum.toString('utf8'), filename);
    stage = mkdtempSync(path.join(root, '.update-'));
    const archivePath = path.join(stage, filename);
    writeFileSync(archivePath, archive);
    const source = extractArchive(archivePath, stage);
    activatePackage(root, source, version, beforeSwitch);
    return { updated: true, version, previousVersion: installed };
  } finally {
    if (stage) rmSync(stage, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}
