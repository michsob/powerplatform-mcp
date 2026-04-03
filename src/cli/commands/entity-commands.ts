import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerEntityCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('entity-metadata <entityName>')
    .description('Get metadata for a Dataverse entity')
    .action(async (entityName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const metadata = await service.getEntityMetadata(entityName);

      const displayName = metadata.DisplayName?.UserLocalizedLabel?.Label ?? 'N/A';

      outputResult({
        fileName: `${entityName}-metadata`,
        data: metadata,
        summary: [
          `Entity: ${metadata.LogicalName} (${displayName})`,
          `  Schema Name: ${metadata.SchemaName}`,
          `  Primary Key: ${metadata.PrimaryIdAttribute}`,
          `  Primary Name: ${metadata.PrimaryNameAttribute}`,
          `  Ownership: ${metadata.OwnershipType}`,
          `  Is Custom: ${metadata.IsCustomEntity}`,
          `  Is Managed: ${metadata.IsManaged}`,
          `  Collection Name: ${metadata.LogicalCollectionName}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('entity-attributes <entityName>')
    .description('Get all attributes/fields for a Dataverse entity')
    .action(async (entityName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.getEntityAttributes(entityName);
      const attrs = result.value || [];

      const keyAttrs = attrs
        .slice(0, 10)
        .map((a: Record<string, unknown>) => a.LogicalName as string)
        .join(', ');

      outputResult({
        fileName: `${entityName}-attributes`,
        data: result,
        summary: [
          `Entity '${entityName}' has ${attrs.length} attributes.`,
          `Key attributes: ${keyAttrs}`,
          attrs.length > 10 ? `+ ${attrs.length - 10} more in file` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('entity-attribute <entityName> <attributeName>')
    .description('Get a specific attribute/field for a Dataverse entity')
    .action(async (entityName: string, attributeName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const attribute = await service.getEntityAttribute(entityName, attributeName);

      const displayName = attribute.DisplayName?.UserLocalizedLabel?.Label ?? 'N/A';

      outputResult({
        fileName: `${entityName}-attribute-${attributeName}`,
        data: attribute,
        summary: [
          `Attribute: ${attribute.LogicalName} (${displayName})`,
          `  Type: ${attribute.AttributeType}`,
          `  Required: ${attribute.RequiredLevel?.Value ?? 'N/A'}`,
          attribute.MaxLength !== undefined ? `  Max Length: ${attribute.MaxLength}` : '',
          attribute.Format ? `  Format: ${attribute.Format}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('entity-relationships <entityName>')
    .description('Get all relationships for a Dataverse entity')
    .action(async (entityName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const relationships = await service.getEntityRelationships(entityName);

      const o2m = relationships.oneToMany?.value || [];
      const m2m = relationships.manyToMany?.value || [];

      const topRelated = o2m
        .slice(0, 5)
        .map((r: Record<string, unknown>) => `${r.SchemaName} (→${r.ReferencingEntity})`)
        .join(', ');

      outputResult({
        fileName: `${entityName}-relationships`,
        data: relationships,
        summary: [
          `Entity '${entityName}' relationships:`,
          `  One-to-Many: ${o2m.length}`,
          `  Many-to-Many: ${m2m.length}`,
          o2m.length > 0 ? `  Top 1:N: ${topRelated}${o2m.length > 5 ? ', ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
