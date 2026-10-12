import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRules, matchingRules, denyPaths, profileToml } from '../src/rules.js';
import { prepare } from '../src/launcher.js';
import { validateAutoArgs } from '../src/auto.js';

test('basename rules match root, nested files and descendants', () => {
  const rules = parseRules('# secrets\r\n.env\r\n.env.*\r\nsecrets/');
  for (const file of ['.env', 'app/.env', 'app/.env.local', 'secrets/key', 'app/secrets/key']) {
    assert.ok(matchingRules(rules, file).length, file);
  }
  assert.equal(matchingRules(rules, 'app/env').length, 0);
});
test('anchored and path-containing rules stay at the workspace root', () => {
  const rules = parseRules('/private/\nconfig/*.pem\n**/keys/?.key');
  assert.ok(matchingRules(rules, 'private/a').length);
  assert.equal(matchingRules(rules, 'app/private/a').length, 0);
  assert.ok(matchingRules(rules, 'config/a.pem').length);
  assert.equal(matchingRules(rules, 'config/deep/a.pem').length, 0);
  assert.ok(matchingRules(rules, 'a/keys/x.key').length);
});
test('reject unsafe or unsupported syntax with line numbers', () => {
  for (const value of ['!a', '../a', 'a/../b', '/','a//b', 'a/**b', '[ab]', '{a,b}', 'a\\b', '~/a', 'C:/a']) {
    assert.throws(() => parseRules('# comment\n' + value), /\.codexignore:2:/);
  }
});
test('compile absolute denies and descendants; escape TOML keys', () => {
  const rules = parseRules('/secrets/\n.env');
  const paths = denyPaths('/tmp/project', rules);
  assert.ok(paths.includes('/tmp/project/secrets'));
  assert.ok(paths.includes('/tmp/project/**/.env/**'));
  assert.ok(paths.includes('/tmp/project/.codexignore'));
  assert.match(profileToml('/tmp/a"b', rules, '/tmp/state'), /a\\"b/);
});
test('launcher rejects alternate execution and configuration options', () => {
  for (const args of [['--yolo'], ['-c', 'x=y'], ['--remote=x'], ['--worktree'], ['exec', '--sandbox', 'danger-full-access'], ['resume']]) {
    assert.throws(() => validateAutoArgs(args));
  }
  validateAutoArgs(['exec', '--json', '--model', 'example', 'Review this']);
  validateAutoArgs(['--', 'hello']);
  assert.throws(() => prepare('/tmp', [], [], 'linux'), /macOS only/);
});
