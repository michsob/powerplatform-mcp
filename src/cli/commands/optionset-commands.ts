import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerOptionSetCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('optionset <optionSetName>')
    .description('Get a global option set definition by name')
    .action(async (optionSetName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getOptionSetService();
      const result = await service.getGlobalOptionSet(optionSetName);

      const options = result.Options || [];
      const preview = options
        .slice(0, 8)
        .map((o: { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } } }) =>
          `${o.Value}: ${o.Label?.UserLocalizedLabel?.Label ?? 'N/A'}`)
        .join('\n    ');

      outputResult({
        fileName: `optionset-${optionSetName}`,
        data: result,
        summary: [
          `Option Set: ${result.Name}`,
          `  Display Name: ${result.DisplayName?.UserLocalizedLabel?.Label ?? 'N/A'}`,
          `  Type: ${result.OptionSetType}`,
          `  Options (${options.length}):`,
          preview ? `    ${preview}${options.length > 8 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
