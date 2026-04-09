import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';

/**
 * Ensure pac CLI is authenticated to the given environment.
 * Creates an auth profile using the same credentials from POWERPLATFORM_* env vars.
 */
function ensurePacAuth(envName: string): void {
  const prefix = `POWERPLATFORM_${envName}`;
  const url = process.env[`${prefix}_URL`];
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const tenantId = process.env[`${prefix}_TENANT_ID`];

  if (!url || !clientId || !clientSecret || !tenantId) {
    throw new Error(`Missing POWERPLATFORM_${envName}_* environment variables for pac auth`);
  }

  // Check if we already have an auth profile for this environment
  try {
    const existing = execSync('pac auth list', { encoding: 'utf-8' });
    if (existing.includes(url)) {
      // Select the existing profile by URL match
      const lines = existing.split('\n');
      for (const line of lines) {
        if (line.includes(url)) {
          const match = line.match(/\[(\d+)\]/);
          if (match) {
            execSync(`pac auth select --index ${match[1]}`, { stdio: 'inherit' });
            return;
          }
        }
      }
    }
  } catch {
    // pac auth list failed, create new profile
  }

  console.log(`Creating pac auth profile for ${envName} (${url})...`);
  const cmd = [
    'pac', 'auth', 'create',
    '--name', `"${envName}"`,
    '--applicationId', clientId,
    '--clientSecret', `"${clientSecret}"`,
    '--tenant', tenantId,
    '--environment', `"${url}"`,
  ].join(' ');

  execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
}

export function registerPacCommands(program: Command, _registry: EnvironmentRegistry): void {
  program
    .command('pac-auth')
    .description('Create or select a pac CLI auth profile using environment credentials')
    .action(async (_opts: unknown, command: Command) => {
      const envName = command.optsWithGlobals().env ?? process.env.POWERPLATFORM_ENVIRONMENTS?.split(',')[0]?.trim();
      if (!envName) {
        console.error('Error: No environment specified. Use --env or set POWERPLATFORM_ENVIRONMENTS.');
        process.exit(1);
      }

      try {
        ensurePacAuth(envName);
        console.log(`\nSuccess: pac CLI authenticated to ${envName}`);
      } catch (error) {
        console.error('\nFailed to authenticate pac CLI:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command('generate-models <outdirectory>')
    .description('Generate early-bound classes using pac modelbuilder build. Automatically uses builderSettings.json if found in the output directory parent.')
    .option('--settings <path>', 'Path to builderSettings.json (auto-detected from outdirectory if not specified)')
    .option('--entities <semicolon-separated>', 'Entity logical names separated by semicolons (overrides settings file)')
    .option('--namespace <ns>', 'Namespace for the generated classes (overrides settings file)')
    .action(async (outdirectory: string, opts: {
      settings?: string;
      entities?: string;
      namespace?: string;
    }, command: Command) => {
      const envName = command.optsWithGlobals().env;
      if (envName) ensurePacAuth(envName);

      // Auto-detect builderSettings.json: check outdirectory parent, then outdirectory itself
      let settingsFile = opts.settings;
      if (!settingsFile) {
        const parentSettings = join(dirname(outdirectory), 'builderSettings.json');
        const localSettings = join(outdirectory, 'builderSettings.json');
        if (existsSync(parentSettings)) {
          settingsFile = parentSettings;
        } else if (existsSync(localSettings)) {
          settingsFile = localSettings;
        }
      }

      const parts = ['pac', 'modelbuilder', 'build', '--outdirectory', `"${outdirectory}"`];

      if (settingsFile) {
        console.log(`Using settings file: ${settingsFile}`);
        parts.push('--settingsTemplateFile', `"${settingsFile}"`);
      }

      // CLI flags override settings file values
      if (opts.entities) {
        parts.push('--entitynamesfilter', `"${opts.entities}"`);
      }

      if (opts.namespace) {
        parts.push('--namespace', opts.namespace);
      }

      const cmd = parts.join(' ');

      console.log(`Executing: ${cmd}`);

      try {
        execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
        console.log(`\nSuccess: early-bound classes generated in ${outdirectory}`);
      } catch (error) {
        console.error('\nFailed to generate early-bound classes:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command('deploy-plugin <pluginFile>')
    .description('Deploy a plugin package (.nupkg) or assembly (.dll) to Dataverse using pac plugin push')
    .requiredOption('--plugin-id <id>', 'ID of the existing plugin assembly or package in Dataverse')
    .option('--type <type>', 'Type of plugin: Nuget (package) or Assembly (dll)', 'Nuget')
    .option('--configuration <config>', 'Build configuration', 'Release')
    .action(async (pluginFile: string, opts: {
      pluginId: string;
      type: string;
      configuration: string;
    }, command: Command) => {
      const envName = command.optsWithGlobals().env;
      if (envName) ensurePacAuth(envName);

      const parts = [
        'pac', 'plugin', 'push',
        '--pluginId', opts.pluginId,
        '--pluginFile', `"${pluginFile}"`,
        '--type', opts.type,
        '--configuration', opts.configuration,
      ];

      const cmd = parts.join(' ');

      console.log(`Executing: ${cmd}`);

      try {
        execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
        console.log(`\nSuccess: plugin deployed from ${pluginFile}`);
      } catch (error) {
        console.error('\nFailed to deploy plugin:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
