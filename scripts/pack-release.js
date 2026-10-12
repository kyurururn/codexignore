import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mkdirSync('dist', { recursive: true });
const result = spawnSync('npm', ['pack', '--pack-destination', 'dist'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const filename = `codexignore-${version}.tgz`;
const checksum = createHash('sha256').update(readFileSync(`dist/${filename}`)).digest('hex');
writeFileSync('dist/SHA256SUMS', `${checksum}  ${filename}\n`);
console.log('Release assets: dist/' + filename + ' and dist/SHA256SUMS');
