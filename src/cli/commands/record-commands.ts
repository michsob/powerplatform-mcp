import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

function parseJsonArg(raw: string, argName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${argName} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (err: any) {
    throw new Error(`Invalid JSON for ${argName}: ${err.message}`);
  }
}

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

  program
    .command('create-record <entityNamePlural> <jsonBody>')
    .description('Create a record. jsonBody is a JSON object; use @odata.bind for lookups.')
    .action(async (entityNamePlural: string, jsonBody: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const data = parseJsonArg(jsonBody, 'jsonBody');
      const result = await ctx.getRecordService().createRecord(entityNamePlural, data);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      outputResult({
        fileName: `${entityNamePlural}-create-${timestamp}`,
        data: result,
        summary: [
          `Created record in '${entityNamePlural}':`,
          `  id: ${result.entityId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('update-record <entityNamePlural> <recordId> <jsonBody>')
    .description('Update a record via PATCH. jsonBody is a partial JSON object.')
    .action(async (entityNamePlural: string, recordId: string, jsonBody: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const data = parseJsonArg(jsonBody, 'jsonBody');
      await ctx.getRecordService().updateRecord(entityNamePlural, recordId, data);

      console.log(`Updated '${entityNamePlural}' (${recordId}): ${Object.keys(data).length} field(s)`);
    });

  program
    .command('delete-record <entityNamePlural> <recordId>')
    .description('Delete a record.')
    .action(async (entityNamePlural: string, recordId: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      await ctx.getRecordService().deleteRecord(entityNamePlural, recordId);

      console.log(`Deleted '${entityNamePlural}' (${recordId})`);
    });

  program
    .command('associate-records <entityNamePlural> <recordId> <navigationProperty> <relatedEntityNamePlural> <relatedRecordId>')
    .description('Associate two records across a navigation property (N:N or 1:N).')
    .action(async (
      entityNamePlural: string,
      recordId: string,
      navigationProperty: string,
      relatedEntityNamePlural: string,
      relatedRecordId: string,
      _opts: unknown,
      command: Command,
    ) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      await ctx.getRecordService().associateRecords(
        entityNamePlural,
        recordId,
        navigationProperty,
        relatedEntityNamePlural,
        relatedRecordId,
      );

      console.log(`Associated '${entityNamePlural}'(${recordId}).${navigationProperty} -> '${relatedEntityNamePlural}'(${relatedRecordId})`);
    });

  program
    .command('disassociate-records <entityNamePlural> <recordId> <navigationProperty> [relatedRecordId]')
    .description('Disassociate records. Omit relatedRecordId for single-valued navigation properties.')
    .action(async (
      entityNamePlural: string,
      recordId: string,
      navigationProperty: string,
      relatedRecordId: string | undefined,
      _opts: unknown,
      command: Command,
    ) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      await ctx.getRecordService().disassociateRecords(
        entityNamePlural,
        recordId,
        navigationProperty,
        relatedRecordId,
      );

      const target = relatedRecordId ? ` -> ${relatedRecordId}` : '';
      console.log(`Disassociated '${entityNamePlural}'(${recordId}).${navigationProperty}${target}`);
    });
}
