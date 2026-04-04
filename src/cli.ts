#!/usr/bin/env node
import { Command } from 'commander';
import { EnvironmentRegistry } from './environment-config.js';
import { registerAllCommands } from './cli/commands/index.js';

const registry = new EnvironmentRegistry();
const program = new Command();

program
  .name('powerplatform-cli')
  .description('PowerPlatform CLI — query Dataverse metadata with cached file output')
  .version('0.1.3')
  .option('--env <name>', 'Environment name (e.g. DEV, UAT). Defaults to first configured environment.');

registerAllCommands(program, registry);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
