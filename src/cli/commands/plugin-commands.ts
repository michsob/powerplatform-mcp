import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerPluginCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('entity-pipeline <entityName>')
    .description('Get plugin pipeline for an entity, organized by message and stage')
    .option('--message <message>', 'Filter by message (Create, Update, Delete)')
    .option('--include-disabled', 'Include disabled steps')
    .action(async (entityName: string, opts: { message?: string; includeDisabled?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getEntityPluginPipeline(
        entityName,
        opts.message,
        opts.includeDisabled ?? false,
      );

      const suffix = opts.message ? `-${opts.message.toLowerCase()}` : '';

      // Count steps by stage
      const stages = { preValidation: 0, preOperation: 0, postOperation: 0 };
      for (const step of result.steps as Array<{ stage: number }>) {
        if (step.stage === 10) stages.preValidation++;
        else if (step.stage === 20) stages.preOperation++;
        else if (step.stage === 40) stages.postOperation++;
      }

      const orderPreview = (result.executionOrder as string[])
        .slice(0, 5)
        .map((name: string, i: number) => `    ${i + 1}. ${name}`);
      const moreCount = result.executionOrder.length - 5;

      outputResult({
        fileName: `${entityName}-plugin-pipeline${suffix}`,
        data: result,
        summary: [
          `Plugin pipeline for '${entityName}'${opts.message ? ` (${opts.message})` : ''}:`,
          `  Total steps: ${result.steps.length}`,
          `  Messages: ${result.messages.length}`,
          `  PreValidation: ${stages.preValidation}, PreOperation: ${stages.preOperation}, PostOperation: ${stages.postOperation}`,
          result.executionOrder.length > 0 ? `  Execution order:` : '',
          ...orderPreview,
          moreCount > 0 ? `    ... and ${moreCount} more` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('plugin-assemblies')
    .description('Get all plugin assemblies in the environment')
    .option('--include-managed', 'Include managed assemblies')
    .option('--max <number>', 'Maximum records', '100')
    .action(async (opts: { includeManaged?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getPluginAssemblies(
        opts.includeManaged ?? false,
        parseInt(opts.max, 10),
      );

      const nameList = (result.assemblies as Array<{ name: string }>)
        .slice(0, 10)
        .map((a) => a.name)
        .join(', ');

      outputResult({
        fileName: 'plugin-assemblies',
        data: result,
        summary: [
          `Found ${result.totalCount} plugin assemblies.`,
          `Assemblies: ${nameList}${result.totalCount > 10 ? ', ...' : ''}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('plugin-assembly <assemblyName>')
    .description('Get a plugin assembly with all types, steps, and images')
    .option('--include-disabled', 'Include disabled steps')
    .action(async (assemblyName: string, opts: { includeDisabled?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getPluginAssemblyComplete(
        assemblyName,
        opts.includeDisabled ?? false,
      );

      const issues = result.validation.potentialIssues;

      outputResult({
        fileName: `plugin-assembly-${assemblyName.toLowerCase().replace(/\s+/g, '-')}`,
        data: result,
        summary: [
          `Plugin assembly: '${assemblyName}'`,
          `  Plugin Types: ${result.pluginTypes.length}`,
          `  Steps: ${result.steps.length}`,
          `  Has Async Steps: ${result.validation.hasAsyncSteps}`,
          `  Has Sync Steps: ${result.validation.hasSyncSteps}`,
          issues.length > 0 ? `  Issues: ${issues.join('; ')}` : '  Issues: None',
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('plugin-trace-logs')
    .description('Get plugin trace logs with filtering')
    .option('--entity <name>', 'Filter by entity name')
    .option('--message <name>', 'Filter by message (Create, Update, Delete)')
    .option('--correlation-id <id>', 'Filter by correlation ID')
    .option('--step-id <id>', 'Filter by plugin step ID')
    .option('--exceptions-only', 'Only show logs with exceptions')
    .option('--hours <number>', 'Hours to look back', '24')
    .option('--max <number>', 'Maximum records', '50')
    .action(async (opts: {
      entity?: string;
      message?: string;
      correlationId?: string;
      stepId?: string;
      exceptionsOnly?: boolean;
      hours: string;
      max: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getPluginTraceLogs({
        entityName: opts.entity,
        messageName: opts.message,
        correlationId: opts.correlationId,
        pluginStepId: opts.stepId,
        exceptionOnly: opts.exceptionsOnly ?? false,
        hoursBack: parseInt(opts.hours, 10),
        maxRecords: parseInt(opts.max, 10),
      });

      const exceptionCount = (result.logs as Array<{ parsed?: { hasException?: boolean } }>)
        .filter((log) => log.parsed?.hasException).length;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      outputResult({
        fileName: `plugin-trace-logs-${timestamp}`,
        data: result,
        summary: [
          `Plugin trace logs (last ${opts.hours}h):`,
          `  Total logs: ${result.totalCount}`,
          `  Exceptions: ${exceptionCount}`,
          opts.entity ? `  Entity filter: ${opts.entity}` : '',
          opts.message ? `  Message filter: ${opts.message}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('all-plugin-steps')
    .description('List all plugin SDK message processing steps across all assemblies')
    .option('--include-disabled', 'Include disabled steps (included by default)')
    .option('--max <number>', 'Maximum records', '500')
    .action(async (opts: { includeDisabled?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getAllPluginSteps({
        includeDisabled: opts.includeDisabled !== false,
        maxRecords: parseInt(opts.max, 10),
      });

      const enabledCount = result.steps.filter((s) => s.enabled).length;
      const disabledCount = result.steps.filter((s) => !s.enabled).length;

      outputResult({
        fileName: 'all-plugin-steps',
        data: result,
        summary: [
          `Found ${result.totalCount} plugin steps:`,
          `  Enabled: ${enabledCount}, Disabled: ${disabledCount}`,
        ].join('\n'),
      }, ctx.environmentName);
    });
}
