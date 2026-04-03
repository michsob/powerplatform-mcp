import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerConfigurationCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('connection-references')
    .description('List connection references in the environment')
    .option('--max-records <n>', 'Maximum records to return', '100')
    .option('--managed-only', 'Only show managed connection references')
    .option('--has-connection', 'Only show references with a connection set')
    .option('--no-connection', 'Only show references without a connection set (orphaned)')
    .option('--inactive', 'Only show inactive connection references')
    .action(async (opts: {
      maxRecords: string;
      managedOnly?: boolean;
      hasConnection?: boolean;
      connection?: boolean;
      inactive?: boolean;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);

      // Resolve mutually exclusive connection flags
      let hasConnection: boolean | undefined;
      if (opts.hasConnection) {
        hasConnection = true;
      } else if (opts.connection === false) {
        hasConnection = false;
      }

      const service = ctx.getConfigurationService();
      const result = await service.getConnectionReferences({
        maxRecords: parseInt(opts.maxRecords, 10),
        managedOnly: opts.managedOnly,
        hasConnection,
        inactive: opts.inactive,
      });
      const refs = result.value || [];

      // Count by connector type
      const connectorCounts: Record<string, number> = {};
      for (const ref of refs as Array<Record<string, unknown>>) {
        const connectorId = String(ref.connectorid ?? 'Unknown');
        connectorCounts[connectorId] = (connectorCounts[connectorId] || 0) + 1;
      }

      const breakdown = Object.entries(connectorCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([connector, count]) => `${connector}: ${count}`)
        .join(', ');

      const nameList = refs
        .slice(0, 10)
        .map((r: Record<string, unknown>) =>
          `${r.connectionreferencedisplayname || r.connectionreferencelogicalname} (${r.statecode === 0 ? 'Active' : 'Inactive'})`
        )
        .join('\n    ');

      outputResult({
        fileName: 'connection-references',
        data: result,
        summary: [
          `Found ${refs.length} connection references:`,
          breakdown ? `  By connector: ${breakdown}` : '',
          refs.length > 0 ? `  References:\n    ${nameList}${refs.length > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('environment-variables')
    .description('List environment variable definitions and their current values')
    .option('--max-records <n>', 'Maximum records to return', '100')
    .option('--managed-only', 'Only show managed environment variables')
    .action(async (opts: { maxRecords: string; managedOnly?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getConfigurationService();
      const result = await service.getEnvironmentVariables({
        maxRecords: parseInt(opts.maxRecords, 10),
        managedOnly: opts.managedOnly,
      });
      const vars = result.value || [];

      // Map numeric type codes to labels
      const typeMap: Record<number, string> = {
        100000000: 'String', 100000001: 'Number', 100000002: 'Boolean',
        100000003: 'JSON', 100000004: 'Data Source',
      };

      // Count by type
      const typeCounts: Record<string, number> = {};
      for (const v of vars as Array<Record<string, unknown>>) {
        const t = typeMap[v.type as number] ?? `Unknown(${v.type})`;
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }

      const breakdown = Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');

      const nameList = vars
        .slice(0, 10)
        .map((v: Record<string, unknown>) => {
          const cv = v.currentValues as Array<Record<string, unknown>> | undefined;
          const hasOverride = cv && cv.length > 0;
          return `${v.displayname || v.schemaname} (${hasOverride ? 'overridden' : 'default'}, managed: ${v.ismanaged})`;
        })
        .join('\n    ');

      outputResult({
        fileName: 'environment-variables',
        data: result,
        summary: [
          `Found ${vars.length} environment variables:`,
          breakdown ? `  By type: ${breakdown}` : '',
          vars.length > 0 ? `  Variables:\n    ${nameList}${vars.length > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
