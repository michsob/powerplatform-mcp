import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerDependencyCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('check-dependencies <componentId> <componentType>')
    .description('Check dependencies for a component before deletion')
    .action(async (componentId: string, componentType: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getDependencyService();
      const result = await service.checkDeleteEligibility(
        componentId,
        parseInt(componentType, 10),
      );

      outputResult({
        fileName: `dependency-${componentId}`,
        data: result,
        summary: [
          `Dependency check for component ${componentId} (type: ${componentType}):`,
          `  Can delete: ${result.canDelete}`,
          `  Dependencies: ${result.dependencies.length}`,
        ].join('\n'),
      }, ctx.environmentName);
    });
}
