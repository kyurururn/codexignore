#!/usr/bin/env node
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { loadRules, matchingRules } from '../src/rules.js';
import { install, uninstall } from '../src/install.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const help = `Usage: codexignore <command>

  install                   Enable automatic .codexignore loading in zsh (one time)
  uninstall                 Remove the zsh integration
  check [--root DIR]         Validate .codexignore syntax
  explain [--root DIR] PATH  Show matching deny rules

After installation, create .codexignore and start a conversation with codex.
No init or run command is needed. Supports macOS and zsh.`;

try {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || ['--help', '-h'].includes(command)) console.log(help);
  else if (['--version', '-V'].includes(command)) console.log(version);
  else if (['install', 'uninstall'].includes(command)) {
    if (args.length) throw new Error(`${command} does not accept arguments`);
    const result = command === 'install' ? install() : uninstall();
    console.log(`${command === 'install' ? 'Installed' : 'Removed'} codex integration in ${result.rc}`);
    console.log(command === 'install' ? 'Open a new terminal. Then create .codexignore and run codex.' : 'Open a new terminal to use the original codex command.');
  } else {
    if (!['check', 'explain'].includes(command)) throw new Error(`unknown command: ${command}`);
    let root = process.cwd();
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--root') {
        if (!args[++i]) throw new Error('--root requires a directory');
        root = args[i];
      } else if (args[i].startsWith('-')) throw new Error(`unknown option: ${args[i]}`);
      else rest.push(args[i]);
    }
    const loaded = loadRules(root);
    root = loaded.root;
    if (command === 'check') {
      if (rest.length) throw new Error('check does not accept positional arguments');
      console.log(`Valid: ${loaded.rules.length} deny rules in ${root}/.codexignore (syntax only)`);
    } else {
      if (rest.length !== 1) throw new Error('explain requires one workspace-relative path');
      const target = path.resolve(root, rest[0]);
      const relative = path.relative(root, target);
      if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('path is outside the workspace');
      const matches = matchingRules(loaded.rules, relative);
      console.log(matches.length ? matches.map(r => `DENY .codexignore:${r.line} ${r.source}`).join('\n') : 'No matching .codexignore rule');
      if (relative === '.codexignore') console.log('DENY wrapper policy: protect .codexignore');
      console.log('Pattern explanation only; this does not prove runtime enforcement.');
    }
  }
} catch (error) {
  console.error(`codexignore: ${error.message}`);
  process.exitCode = 1;
}
