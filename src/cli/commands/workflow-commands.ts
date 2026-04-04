import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerWorkflowCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('workflows')
    .description('List classic Dynamics workflows')
    .option('--active', 'Only show active workflows')
    .option('--max <number>', 'Maximum records', '25')
    .action(async (opts: { active?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getWorkflowService();
      const result = await service.getWorkflows(
        opts.active ?? false,
        parseInt(opts.max, 10),
      );

      const nameList = (result.workflows as Array<{ name: unknown; state: unknown; primaryEntity: unknown }>)
        .slice(0, 10)
        .map((w) => `${w.name} (${w.state}, ${w.primaryEntity})`)
        .join('\n    ');

      outputResult({
        fileName: 'workflows',
        data: result,
        summary: [
          `Found ${result.totalCount} classic workflows${result.hasMore ? ' (more available)' : ''}:`,
          result.totalCount > 0 ? `  Workflows:\n    ${nameList}${result.totalCount > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('workflow-definition <workflowId>')
    .description('Get a classic workflow with its XAML definition')
    .option('--summary', 'Return parsed summary instead of full XAML')
    .action(async (workflowId: string, opts: { summary?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getWorkflowService();
      const result = await service.getWorkflowDefinition(workflowId, opts.summary ?? false) as Record<string, unknown>;

      const wfSummary = result.summary as Record<string, unknown> | undefined;
      const summaryLines: string[] = [
        `Workflow: ${result.name}`,
        `  State: ${result.state}`,
        `  Mode: ${result.mode}`,
        `  Primary Entity: ${result.primaryEntity}`,
        `  Is Managed: ${result.isManaged}`,
      ];

      if (wfSummary) {
        summaryLines.push(
          `  Trigger: ${wfSummary.triggerInfo}`,
          `  Activities: ${wfSummary.activityCount}`,
          wfSummary.hasConditions ? '  Has conditions: yes' : '',
          wfSummary.hasWaitConditions ? '  Has wait conditions: yes' : '',
          wfSummary.sendsEmail ? '  Sends email: yes' : '',
          wfSummary.createsRecords ? '  Creates records: yes' : '',
          wfSummary.updatesRecords ? '  Updates records: yes' : '',
          Array.isArray(wfSummary.tablesModified) && wfSummary.tablesModified.length > 0
            ? `  Tables modified: ${wfSummary.tablesModified.join(', ')}`
            : '',
        );
      } else if (result.xaml) {
        summaryLines.push(`  XAML size: ${(result.xaml as string).length} chars`);
      }

      outputResult({
        fileName: `workflow-${workflowId}-definition`,
        data: result,
        summary: summaryLines.filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('ootb-workflows')
    .description('List all non-cloud-flow workflows (background, business rules, actions, BPFs)')
    .option('--max <number>', 'Maximum records', '500')
    .option('--categories <list>', 'Comma-separated category codes (0=Background, 1=On-Demand, 2=Business Rule, 3=Action, 4=BPF)')
    .action(async (opts: { max: string; categories?: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getWorkflowService();

      const categories = opts.categories
        ? opts.categories.split(',').map((c) => parseInt(c.trim(), 10))
        : undefined;

      const result = await service.getOotbWorkflows({
        maxRecords: parseInt(opts.max, 10),
        categories,
      });

      const catSummary = Object.entries(result.byCategoryCount)
        .map(([cat, count]) => `${cat}: ${count}`)
        .join(', ');

      outputResult({
        fileName: 'ootb-workflows',
        data: result,
        summary: [
          `Found ${result.totalCount} OOTB workflows:`,
          `  By category: ${catSummary}`,
        ].join('\n'),
      }, ctx.environmentName);
    });
}
