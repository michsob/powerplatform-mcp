#!/usr/bin/env node
// First: loads .env before any other module reads the environment.
import './load-env.js';
import { readFileSync } from 'node:fs';
import { EnvironmentRegistry } from './environment-config.js';
import { createProgram, runProgram } from './cli/program.js';

// Version comes from package.json so `--version` cannot drift from what was
// actually published. Resolves from both the repo (build/cli.js -> ./package.json)
// and the published CLI package, where publish.yml stages build/ and a generated
// package.json side by side in dist-cli/.
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

// The CLI runs in a terminal, so an interactive environment may open the browser to sign in.
const registry = new EnvironmentRegistry({ allowInteractive: true });

void runProgram(createProgram(registry, version), process.argv);
