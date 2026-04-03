import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerRecordCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('record <entityNamePlural> <recordId>')
    .description('Get a specific record by entity (plural) and ID')
    .action(async (entityNamePlural: string, recordId: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getRecordService();
      const record = await service.getRecord(entityNamePlural, recordId);

      const keys = Object.keys(record).filter((k) => !k.startsWith('@') && !k.startsWith('_'));
      const preview = keys.slice(0, 5).map((k) => `${k}: ${record[k]}`).join(', ');

      outputResult({
        fileName: `${entityNamePlural}-record-${recordId}`,
        data: record,
        summary: [
          `Record from '${entityNamePlural}' (${recordId}):`,
          `  Fields: ${keys.length}`,
          `  Preview: ${preview}${keys.length > 5 ? ', ...' : ''}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('query-records <entityNamePlural> <filter>')
    .description('Query records using an OData filter expression')
    .option('--max <number>', 'Maximum records', '50')
    .action(async (entityNamePlural: string, filter: string, opts: { max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getRecordService();
      const result = await service.queryRecords(entityNamePlural, filter, parseInt(opts.max, 10));
      const records = result.value || [];

      // Show field names from first record
      let fieldPreview = '';
      if (records.length > 0) {
        const keys = Object.keys(records[0]).filter((k) => !k.startsWith('@') && !k.startsWith('_'));
        fieldPreview = `Fields: ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', ...' : ''}`;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      outputResult({
        fileName: `${entityNamePlural}-query-${timestamp}`,
        data: result,
        summary: [
          `Query '${entityNamePlural}' where ${filter}:`,
          `  Records returned: ${records.length}`,
          fieldPreview ? `  ${fieldPreview}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
