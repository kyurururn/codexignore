#!/usr/bin/env node
import { startAutomatic } from '../src/auto.js';
try { process.exitCode = await startAutomatic(process.argv.slice(2)); }
catch (error) { console.error(`codexignore: ${error.message}`); process.exitCode = 1; }
