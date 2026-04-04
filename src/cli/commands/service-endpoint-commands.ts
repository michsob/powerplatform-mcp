import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerServiceEndpointCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('service-endpoints')
    .description('List all service endpoints (Service Bus, webhooks, Event Hub, Event Grid)')
    .option('--max <number>', 'Maximum records', '100')
    .action(async (opts: { max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getServiceEndpointService();
      const result = await service.getServiceEndpoints(parseInt(opts.max, 10));

      const contractCounts: Record<string, number> = {};
      for (const ep of result.endpoints) {
        contractCounts[ep.contractName] = (contractCounts[ep.contractName] || 0) + 1;
      }
      const contractSummary = Object.entries(contractCounts)
        .map(([c, n]) => `${c}: ${n}`)
        .join(', ');

      outputResult({
        fileName: 'service-endpoints',
        data: result,
        summary: [
          `Found ${result.totalCount} service endpoints:`,
          result.totalCount > 0 ? `  By contract: ${contractSummary}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
