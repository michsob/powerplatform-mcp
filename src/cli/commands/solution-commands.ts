import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';
import { componentTypeName, missingDependencySummary } from '../../services/solution-service.js';

export function registerSolutionCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('solutions')
    .description('List all visible solutions')
    .action(async (_opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const result = await service.getSolutions();
      const solutions = result.value || [];

      const nameList = solutions
        .slice(0, 10)
        .map((s: Record<string, unknown>) => `${s.uniquename} v${s.version}`)
        .join('\n    ');

      outputResult({
        fileName: 'solutions',
        data: result,
        summary: [
          `Found ${solutions.length} solutions:`,
          solutions.length > 0 ? `  Solutions:\n    ${nameList}${solutions.length > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('solution <uniqueName>')
    .description('Get a specific solution by unique name')
    .action(async (uniqueName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const solution = await service.getSolution(uniqueName);

      if (!solution) {
        console.error(`Solution '${uniqueName}' not found.`);
        process.exit(1);
      }

      outputResult({
        fileName: `solution-${uniqueName}`,
        data: solution,
        summary: [
          `Solution: ${solution.uniquename}`,
          `  Display Name: ${solution.friendlyname ?? 'N/A'}`,
          `  Version: ${solution.version}`,
          `  Is Managed: ${solution.ismanaged}`,
          `  Created: ${solution.createdon}`,
          `  Modified: ${solution.modifiedon}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('solution-components <uniqueName>')
    .description('Get all components in a solution')
    .action(async (uniqueName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const result = await service.getSolutionComponents(uniqueName);
      const components = result.value || [];

      // Count by component type
      const typeCounts: Record<number, number> = {};
      for (const c of components as Array<{ componenttype: number }>) {
        typeCounts[c.componenttype] = (typeCounts[c.componenttype] || 0) + 1;
      }

      const breakdown = Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => `${componentTypeName(parseInt(type, 10))}: ${count}`)
        .join(', ');

      outputResult({
        fileName: `solution-${uniqueName}-components`,
        data: result,
        summary: [
          `Solution '${uniqueName}' has ${components.length} components:`,
          `  Breakdown: ${breakdown}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('add-solution-component <solutionUniqueName> <componentId> <componentType>')
    .description('Add a component to a Dataverse solution')
    .option('--add-required', 'Also add required dependencies')
    .action(async (solutionUniqueName: string, componentId: string, componentType: string, opts: {
      addRequired?: boolean;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const result = await service.addSolutionComponent(
        solutionUniqueName, componentId, parseInt(componentType, 10), opts.addRequired ?? false,
      );

      outputResult({
        fileName: `add-component-${solutionUniqueName}-${componentId}`,
        data: result,
        summary: [
          `Added component to solution '${solutionUniqueName}':`,
          `  Component ID: ${componentId}`,
          `  Component Type: ${componentType}`,
          `  Add Required: ${opts.addRequired ?? false}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('remove-solution-component <solutionUniqueName> <componentId> <componentType>')
    .description('Remove a component from an unmanaged solution (the component stays in the environment)')
    .action(async (solutionUniqueName: string, componentId: string, componentType: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const result = await service.removeSolutionComponent(solutionUniqueName, componentId, parseInt(componentType, 10));

      outputResult({
        fileName: `remove-component-${solutionUniqueName}-${result.componentId}`,
        data: result,
        summary: [
          `Removed component from solution '${solutionUniqueName}':`,
          `  Component: ${result.componentTypeName} ${result.componentId}`,
          ...(result.subcomponents.length > 0
            ? [`  Subcomponents removed with it: ${result.subcomponents.length}`]
            : []),
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('move-solution-component <sourceSolution> <targetSolution> <componentId> <componentType>')
    .description('Move a component from one unmanaged solution to another, then check both for missing dependencies')
    .option('--add-required', 'Also add to the target the components this one requires')
    .action(async (sourceSolution: string, targetSolution: string, componentId: string, componentType: string, opts: {
      addRequired?: boolean;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const result = await service.moveSolutionComponent(
        sourceSolution, targetSolution, componentId, parseInt(componentType, 10),
        { addRequiredComponents: opts.addRequired ?? false },
      );
      const behavior = result.rootComponentBehavior;

      outputResult({
        fileName: `move-component-${sourceSolution}-${targetSolution}-${result.componentId}`,
        data: result,
        summary: [
          `Moved component from '${sourceSolution}' to '${targetSolution}':`,
          `  Component: ${result.componentTypeName} ${result.componentId}`,
          ...(result.subcomponents.length > 0
            ? [`  Subcomponents moved with it: ${result.subcomponents.length}`]
            : []),
          ...(behavior.source !== behavior.target
            ? [`  ⚠ The target holds it with rootcomponentbehavior ${behavior.target}; the source held it with ${behavior.source}`]
            : []),
          '',
          'Missing dependencies after the move:',
          ...missingDependencySummary(sourceSolution, result.missingDependencies.source).map((l) => `  ${l}`),
          ...missingDependencySummary(targetSolution, result.missingDependencies.target).map((l) => `  ${l}`),
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('publish-customizations')
    .description('Publish entity or all customizations in Dataverse')
    .option('--entity <logicalName>', 'Entity to publish (if omitted, publishes all)')
    .action(async (opts: { entity?: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      await service.publishCustomizations(opts.entity);

      const scope = opts.entity ? `entity '${opts.entity}'` : 'all entities';
      console.log(`Published customizations for ${scope}`);
    });

  program
    .command('publishers')
    .description('List publishers, including read-only ones that came with managed solutions')
    .option('--writable-only', 'Only publishers that are not read-only (ones you can create components under)')
    .action(async (opts: { writableOnly?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const result = await service.getPublishers({ writableOnly: opts.writableOnly });
      const publishers = result.value || [];

      const nameList = publishers
        .slice(0, 10)
        .map((p: Record<string, unknown>) => `${p.uniquename} (prefix: ${p.customizationprefix})${p.isreadonly ? ' [read-only]' : ''}`)
        .join('\n    ');

      outputResult({
        fileName: 'publishers',
        data: result,
        summary: [
          `Found ${publishers.length} publishers:`,
          publishers.length > 0 ? `  Publishers:\n    ${nameList}${publishers.length > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
