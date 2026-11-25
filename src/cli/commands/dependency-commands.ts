import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';
import { missingDependencySummary } from '../../services/solution-service.js';

export function registerDependencyCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('check-dependencies <componentId> <componentType>')
    .description('Check dependencies for a component before deleting it from the environment')
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

  program
    .command('check-solution-dependencies <solutionUniqueName>')
    .description("List the components a solution's components require but the solution does not include")
    .action(async (solutionUniqueName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const result = await service.getMissingDependencies(solutionUniqueName);

      outputResult({
        fileName: `solution-${solutionUniqueName}-missing-dependencies`,
        data: result,
        summary: missingDependencySummary(solutionUniqueName, result.missingDependencies).join('\n'),
      }, ctx.environmentName);
    });
}
