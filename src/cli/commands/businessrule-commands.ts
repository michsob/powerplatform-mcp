import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerBusinessRuleCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('business-rules')
    .description('List all business rules in the environment')
    .option('--active', 'Only show active business rules')
    .option('--max <number>', 'Maximum records', '100')
    .action(async (opts: { active?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getBusinessRuleService();
      const result = await service.getBusinessRules(
        opts.active ?? false,
        parseInt(opts.max, 10),
      );

      // Group by entity
      const byEntity: Record<string, string[]> = {};
      for (const rule of result.businessRules as Array<{ primaryEntity: string; name: string }>) {
        const entity = rule.primaryEntity || 'none';
        if (!byEntity[entity]) byEntity[entity] = [];
        byEntity[entity].push(rule.name);
      }

      const entityBreakdown = Object.entries(byEntity)
        .slice(0, 5)
        .map(([entity, rules]) => `${entity}: ${rules.length}`)
        .join(', ');

      outputResult({
        fileName: 'business-rules',
        data: result,
        summary: [
          `Found ${result.totalCount} business rules.`,
          `  By entity: ${entityBreakdown}${Object.keys(byEntity).length > 5 ? ', ...' : ''}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('business-rule <workflowId>')
    .description('Get a specific business rule with its XAML definition')
    .action(async (workflowId: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getBusinessRuleService();
      const result = await service.getBusinessRule(workflowId) as Record<string, unknown>;

      outputResult({
        fileName: `business-rule-${workflowId}`,
        data: result,
        summary: [
          `Business Rule: ${result.name}`,
          `  State: ${result.state}`,
          `  Primary Entity: ${result.primaryEntity}`,
          `  Is Managed: ${result.isManaged}`,
          result.xaml ? `  XAML size: ${(result.xaml as string).length} chars` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
