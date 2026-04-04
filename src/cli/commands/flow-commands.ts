import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerFlowCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('flows')
    .description('List Power Automate cloud flows')
    .option('--active', 'Only show active flows')
    .option('--name <contains>', 'Filter by name (contains)')
    .option('--include-managed', 'Include managed flows')
    .option('--max <number>', 'Maximum records', '25')
    .action(async (opts: { active?: boolean; name?: string; includeManaged?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFlowService();
      const result = await service.getFlows({
        activeOnly: opts.active ?? false,
        nameContains: opts.name,
        maxRecords: parseInt(opts.max, 10),
      });

      const nameList = result.flows
        .slice(0, 10)
        .map((f) => `${f.name} (${f.state})`)
        .join('\n    ');

      outputResult({
        fileName: 'flows',
        data: result,
        summary: [
          `Found ${result.totalCount} flows${result.hasMore ? ' (more available)' : ''}:`,
          result.excluded.total > 0 ? `  Excluded: ${result.excluded.total} (system: ${result.excluded.system}, copilot: ${result.excluded.copilotSales})` : '',
          `  Flows:\n    ${nameList}${result.totalCount > 10 ? '\n    ...' : ''}`,
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('flow-definition <flowId>')
    .description('Get a flow with its complete definition')
    .option('--summary', 'Return summary instead of full definition')
    .action(async (flowId: string, opts: { summary?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFlowService();
      const result = await service.getFlowDefinition(flowId, opts.summary ?? false) as Record<string, unknown>;

      const flowSummary = result.summary as Record<string, unknown> | undefined;
      const summaryLines: string[] = [
        `Flow: ${result.name}`,
        `  State: ${result.state}`,
        `  Type: ${result.type}`,
        result.description ? `  Description: ${result.description}` : '',
        result.primaryEntity ? `  Primary Entity: ${result.primaryEntity}` : '',
      ];

      if (flowSummary) {
        summaryLines.push(
          `  Trigger: ${flowSummary.triggerInfo}`,
          `  Actions: ${flowSummary.actionCount}`,
          flowSummary.hasConditions ? '  Has conditions: yes' : '',
          flowSummary.hasLoops ? '  Has loops: yes' : '',
          flowSummary.hasErrorHandling ? '  Has error handling: yes' : '',
          Array.isArray(flowSummary.connectors) && flowSummary.connectors.length > 0
            ? `  Connectors: ${flowSummary.connectors.join(', ')}`
            : '',
          Array.isArray(flowSummary.tablesModified) && flowSummary.tablesModified.length > 0
            ? `  Tables modified: ${flowSummary.tablesModified.join(', ')}`
            : '',
          Array.isArray(flowSummary.customApisCalled) && flowSummary.customApisCalled.length > 0
            ? `  Custom APIs: ${flowSummary.customApisCalled.join(', ')}`
            : '',
        );
      }

      outputResult({
        fileName: `flow-${flowId}-definition`,
        data: result,
        summary: summaryLines.filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('flow-runs <flowId>')
    .description('Get run history for a Power Automate flow')
    .option('--status <status>', 'Filter by status (Succeeded, Failed, Running, Waiting, Cancelled)')
    .option('--after <date>', 'Only runs started after this date (ISO 8601)')
    .option('--before <date>', 'Only runs started before this date (ISO 8601)')
    .option('--max <number>', 'Maximum records', '50')
    .action(async (flowId: string, opts: { status?: string; after?: string; before?: string; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFlowService();
      const result = await service.getFlowRuns(flowId, {
        status: opts.status,
        startedAfter: opts.after,
        startedBefore: opts.before,
        maxRecords: parseInt(opts.max, 10),
      });

      // Count by status
      const statusCounts: Record<string, number> = {};
      for (const run of result.runs) {
        statusCounts[run.status] = (statusCounts[run.status] || 0) + 1;
      }
      const statusSummary = Object.entries(statusCounts)
        .map(([s, c]) => `${s}: ${c}`)
        .join(', ');

      outputResult({
        fileName: `flow-${flowId}-runs`,
        data: result,
        summary: [
          `Flow runs for ${flowId}${result.hasMore ? ' (more available)' : ''}:`,
          `  Total: ${result.totalCount}`,
          `  By status: ${statusSummary}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('flow-run-details <flowId> <runId>')
    .description('Get detailed flow run info including action-level outputs')
    .action(async (flowId: string, runId: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFlowService();
      const result = await service.getFlowRunDetails(flowId, runId) as Record<string, unknown>;

      const actionsSummary = result.actionsSummary as {
        total: number; succeeded: number; failed: number; skipped: number;
      };
      const failedErrors = result.failedActionErrors as Array<{ action: string; message: string }>;

      const summaryLines = [
        `Flow run ${runId}:`,
        `  Status: ${result.status}`,
        `  Actions: ${actionsSummary.total} (succeeded: ${actionsSummary.succeeded}, failed: ${actionsSummary.failed}, skipped: ${actionsSummary.skipped})`,
      ];

      if (failedErrors.length > 0) {
        summaryLines.push('  Failed actions:');
        for (const err of failedErrors.slice(0, 5)) {
          summaryLines.push(`    - ${err.action}: ${err.message}`);
        }
        if (failedErrors.length > 5) {
          summaryLines.push(`    ... and ${failedErrors.length - 5} more`);
        }
      }

      outputResult({
        fileName: `flow-${flowId}-run-${runId}`,
        data: result,
        summary: summaryLines.join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('search-workflows')
    .description('Search workflows (classic and Power Automate)')
    .option('--name <name>', 'Search by name (contains)')
    .option('--entity <entity>', 'Filter by primary entity')
    .option('--category <number>', 'Filter by category (0=Classic, 5=Flow)')
    .option('--active', 'Only show active workflows')
    .option('--max <number>', 'Maximum results', '50')
    .action(async (opts: { name?: string; entity?: string; category?: string; active?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFlowService();
      const result = await service.searchWorkflows({
        name: opts.name,
        primaryEntity: opts.entity,
        category: opts.category ? parseInt(opts.category, 10) : undefined,
        statecode: opts.active ? 1 : undefined,
        maxResults: parseInt(opts.max, 10),
      });

      const nameList = (result.workflows as Array<{ name: unknown; category: unknown }>)
        .slice(0, 10)
        .map((w) => `${w.name} (${w.category})`)
        .join('\n    ');

      outputResult({
        fileName: 'search-workflows',
        data: result,
        summary: [
          `Found ${result.totalCount} workflows${result.hasMore ? ' (more available)' : ''}:`,
          result.totalCount > 0 ? `  Workflows:\n    ${nameList}${result.totalCount > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('flow-health')
    .description('Scan all cloud flows for health metrics (success rate, failures)')
    .option('--days <number>', 'Days of run history to analyze', '7')
    .option('--max-runs <number>', 'Max runs to check per flow', '100')
    .option('--max-flows <number>', 'Max flows to scan', '500')
    .option('--active', 'Only scan activated flows (default: true)')
    .action(async (opts: { days: string; maxRuns: string; maxFlows: string; active?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFlowService();
      const result = await service.scanFlowHealth({
        daysBack: parseInt(opts.days, 10),
        maxRunsPerFlow: parseInt(opts.maxRuns, 10),
        maxFlows: parseInt(opts.maxFlows, 10),
        activeOnly: opts.active !== false,
      });

      const topList = result.topFailingFlows
        .slice(0, 5)
        .map((f) => `    ${f.flowName}: ${f.failedRuns} failures (${f.successRate}% success)`)
        .join('\n');

      outputResult({
        fileName: 'flow-health-scan',
        data: result,
        summary: [
          `Flow health scan (last ${opts.days} days):`,
          `  Total scanned: ${result.summary.totalFlowsScanned}`,
          `  Healthy: ${result.summary.flowsHealthy}, Failing: ${result.summary.flowsWithFailures}, No runs: ${result.summary.flowsNoRuns}`,
          `  Overall success rate: ${result.summary.overallSuccessRate}%`,
          result.topFailingFlows.length > 0 ? `  Top failing flows:\n${topList}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('flow-inventory')
    .description('Get complete inventory of all cloud flows (deployment metadata, no run history)')
    .option('--max <number>', 'Maximum flows to return', '500')
    .action(async (opts: { max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFlowService();
      const result = await service.getFlowInventory({
        maxRecords: parseInt(opts.max, 10),
      });

      const stateCounts: Record<string, number> = {};
      for (const flow of result.flows) {
        stateCounts[flow.state] = (stateCounts[flow.state] || 0) + 1;
      }
      const stateSummary = Object.entries(stateCounts)
        .map(([s, c]) => `${s}: ${c}`)
        .join(', ');

      outputResult({
        fileName: 'flow-inventory',
        data: result,
        summary: [
          `Flow inventory: ${result.totalCount} flows`,
          `  By state: ${stateSummary}`,
          result.excluded > 0 ? `  Excluded: ${result.excluded}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
