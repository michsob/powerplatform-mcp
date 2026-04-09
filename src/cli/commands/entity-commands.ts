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
    .command('create-entity-string-attribute <entityName> <schemaName> <displayName>')
    .description('Create a Single Line of Text attribute on a Dataverse entity')
    .option('--max-length <n>', 'Maximum text length', '100')
    .option('--required-level <level>', 'Required level: None, ApplicationRequired, SystemRequired', 'None')
    .option('--description <desc>', 'Description for the attribute')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (entityName: string, schemaName: string, displayName: string, opts: {
      maxLength: string;
      requiredLevel: string;
      description?: string;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.createStringAttribute(
        entityName, schemaName, displayName,
        parseInt(opts.maxLength, 10),
        opts.requiredLevel as 'None' | 'ApplicationRequired' | 'SystemRequired',
        opts.description,
        undefined, opts.solution,
      );

      outputResult({
        fileName: `${entityName}-create-attribute-${schemaName}`,
        data: result,
        summary: [
          `Created string attribute on '${entityName}':`,
          `  Schema Name: ${schemaName}`,
          `  Display Name: ${displayName}`,
          `  Max Length: ${opts.maxLength}`,
          `  Required Level: ${opts.requiredLevel}`,
          `  Attribute ID: ${result.attributeId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('entity-keys <entityName>')
    .description('Get alternate keys defined on a Dataverse entity')
    .action(async (entityName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.getEntityKeys(entityName);
      const keys = result.value || [];

      const keyList = keys
        .slice(0, 10)
        .map((k: Record<string, unknown>) => {
          const dn = (k.DisplayName as any)?.UserLocalizedLabel?.Label ?? k.SchemaName;
          const attrs = (k.KeyAttributes as string[])?.join(', ') ?? 'N/A';
          return `${dn} [${attrs}]`;
        })
        .join('\n    ');

      outputResult({
        fileName: `${entityName}-keys`,
        data: result,
        summary: [
          `Found ${keys.length} alternate keys on entity '${entityName}':`,
          keys.length > 0 ? `  Keys:\n    ${keyList}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-entity-alternate-key <entityName> <schemaName> <displayName>')
    .description('Create an alternate key on a Dataverse entity')
    .argument('<keyAttributes...>', 'Attribute logical names that make up the key')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (entityName: string, schemaName: string, displayName: string, keyAttributes: string[], opts: {
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.createAlternateKey(entityName, schemaName, displayName, keyAttributes, undefined, opts.solution);

      outputResult({
        fileName: `${entityName}-create-key-${schemaName}`,
        data: result,
        summary: [
          `Created alternate key on '${entityName}':`,
          `  Schema Name: ${schemaName}`,
          `  Display Name: ${displayName}`,
          `  Key Attributes: ${keyAttributes.join(', ')}`,
          `  Key ID: ${result.keyId}`,
        ].join('\n'),
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
