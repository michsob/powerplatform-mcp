import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

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

      const typeNames: Record<number, string> = {
        1: 'Entity', 2: 'Attribute', 3: 'Relationship', 9: 'OptionSet',
        10: 'EntityRelationship', 26: 'View', 29: 'Process', 59: 'Chart',
        60: 'Form', 61: 'WebResource', 62: 'SiteMap', 63: 'ConnectionRole',
        65: 'Assembly', 91: 'PluginStep', 92: 'PluginStepImage',
        300: 'CanvasApp', 371: 'Connector',
      };

      const breakdown = Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => `${typeNames[parseInt(type)] ?? `Type ${type}`}: ${count}`)
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
    .description('List all non-readonly publishers')
    .action(async (_opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSolutionService();
      const result = await service.getPublishers();
      const publishers = result.value || [];

      const nameList = publishers
        .slice(0, 10)
        .map((p: Record<string, unknown>) => `${p.uniquename} (prefix: ${p.customizationprefix})`)
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
