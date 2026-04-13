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
    .command('create-entity <schemaName> <displayName> <displayCollectionName>')
    .description('Create a new custom Dataverse entity (table) with a primary name attribute')
    .option('--primary-name-schema <name>', 'Schema name for the primary name attribute', 'br_Name')
    .option('--primary-name-display <name>', 'Display name for the primary name attribute', 'Name')
    .option('--description <desc>', 'Description for the entity')
    .option('--ownership <type>', 'Ownership type: UserOwned or OrganizationOwned', 'UserOwned')
    .option('--has-activities', 'Enable activities on the entity', false)
    .option('--has-notes', 'Enable notes on the entity', false)
    .option('--solution <name>', 'Solution unique name to add the entity to')
    .action(async (
      schemaName: string,
      displayName: string,
      displayCollectionName: string,
      opts: {
        primaryNameSchema: string;
        primaryNameDisplay: string;
        description?: string;
        ownership: string;
        hasActivities: boolean;
        hasNotes: boolean;
        solution?: string;
      },
      command: Command,
    ) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.createEntity(
        schemaName,
        displayName,
        displayCollectionName,
        opts.primaryNameSchema,
        opts.primaryNameDisplay,
        opts.description,
        opts.ownership as 'UserOwned' | 'OrganizationOwned',
        opts.hasActivities,
        opts.hasNotes,
        undefined,
        opts.solution,
      );

      outputResult({
        fileName: `create-entity-${schemaName}`,
        data: result,
        summary: [
          `Created entity:`,
          `  Schema Name: ${schemaName}`,
          `  Display Name: ${displayName}`,
          `  Collection Name: ${displayCollectionName}`,
          `  Primary Name: ${opts.primaryNameSchema} (${opts.primaryNameDisplay})`,
          `  Ownership: ${opts.ownership}`,
          `  Entity ID: ${result.entityId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-entity-picklist-attribute <entityName> <schemaName> <displayName>')
    .description('Create a local Picklist (Choice) attribute on a Dataverse entity')
    .option('-o, --option <value:label>', 'Option in value:label format (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc; }, [] as string[])
    .option('--required-level <level>', 'Required level: None, ApplicationRequired, SystemRequired', 'None')
    .option('--description <desc>', 'Description for the attribute')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (entityName: string, schemaName: string, displayName: string, opts: {
      option: string[];
      requiredLevel: string;
      description?: string;
      solution?: string;
    }, command: Command) => {
      if (opts.option.length === 0) {
        console.error('Error: At least one --option value:label is required.');
        process.exit(1);
      }

      const options = opts.option.map(o => {
        const colonIdx = o.indexOf(':');
        if (colonIdx < 1) {
          console.error(`Error: Invalid option format "${o}". Expected value:label (e.g. 100000000:Active).`);
          process.exit(1);
        }
        return { value: parseInt(o.substring(0, colonIdx), 10), label: o.substring(colonIdx + 1) };
      });

      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.createPicklistAttribute(
        entityName, schemaName, displayName, options,
        opts.requiredLevel as 'None' | 'ApplicationRequired' | 'SystemRequired',
        opts.description,
        undefined, opts.solution,
      );

      const optionList = options.map(o => `    ${o.value} = ${o.label}`).join('\n');
      outputResult({
        fileName: `${entityName}-create-picklist-${schemaName}`,
        data: result,
        summary: [
          `Created picklist attribute on '${entityName}':`,
          `  Schema Name: ${schemaName}`,
          `  Display Name: ${displayName}`,
          `  Options:\n${optionList}`,
          `  Required Level: ${opts.requiredLevel}`,
          `  Attribute ID: ${result.attributeId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('delete-entity-attribute <entityName> <attributeName>')
    .description('Delete an attribute from a Dataverse entity (irreversible)')
    .action(async (entityName: string, attributeName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      await service.deleteEntityAttribute(entityName, attributeName);

      outputResult({
        fileName: `${entityName}-delete-attribute-${attributeName}`,
        data: { deleted: true, entityName, attributeName },
        summary: `Deleted attribute '${attributeName}' from '${entityName}'.`,
      }, ctx.environmentName);
    });

  program
    .command('create-entity-money-attribute <entityName> <schemaName> <displayName>')
    .description('Create a Money (Currency) attribute on a Dataverse entity')
    .option('--precision-source <n>', 'Precision source: 0 = fixed (use --precision), 1 = pricing, 2 = currency', '2')
    .option('--precision <n>', 'Display precision when precision-source is 0 (0-4)', '2')
    .option('--min <n>', 'Minimum allowed value', '-100000000000')
    .option('--max <n>', 'Maximum allowed value', '100000000000')
    .option('--required-level <level>', 'Required level: None, ApplicationRequired, SystemRequired', 'None')
    .option('--description <desc>', 'Description for the attribute')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (entityName: string, schemaName: string, displayName: string, opts: {
      precisionSource: string;
      precision: string;
      min: string;
      max: string;
      requiredLevel: string;
      description?: string;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.createMoneyAttribute(
        entityName, schemaName, displayName,
        parseInt(opts.precisionSource, 10) as 0 | 1 | 2,
        parseInt(opts.precision, 10),
        parseFloat(opts.min),
        parseFloat(opts.max),
        opts.requiredLevel as 'None' | 'ApplicationRequired' | 'SystemRequired',
        opts.description,
        undefined, opts.solution,
      );

      outputResult({
        fileName: `${entityName}-create-money-${schemaName}`,
        data: result,
        summary: [
          `Created money attribute on '${entityName}':`,
          `  Schema Name: ${schemaName}`,
          `  Display Name: ${displayName}`,
          `  Precision Source: ${opts.precisionSource}`,
          `  Precision: ${opts.precision}`,
          `  Range: ${opts.min} to ${opts.max}`,
          `  Required Level: ${opts.requiredLevel}`,
          `  Attribute ID: ${result.attributeId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-entity-decimal-attribute <entityName> <schemaName> <displayName>')
    .description('Create a Decimal Number attribute on a Dataverse entity')
    .option('--precision <n>', 'Number of digits after the decimal (0-10)', '2')
    .option('--min <n>', 'Minimum allowed value', '-100000000000')
    .option('--max <n>', 'Maximum allowed value', '100000000000')
    .option('--required-level <level>', 'Required level: None, ApplicationRequired, SystemRequired', 'None')
    .option('--description <desc>', 'Description for the attribute')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (entityName: string, schemaName: string, displayName: string, opts: {
      precision: string;
      min: string;
      max: string;
      requiredLevel: string;
      description?: string;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.createDecimalAttribute(
        entityName, schemaName, displayName,
        parseInt(opts.precision, 10),
        parseFloat(opts.min),
        parseFloat(opts.max),
        opts.requiredLevel as 'None' | 'ApplicationRequired' | 'SystemRequired',
        opts.description,
        undefined, opts.solution,
      );

      outputResult({
        fileName: `${entityName}-create-decimal-${schemaName}`,
        data: result,
        summary: [
          `Created decimal attribute on '${entityName}':`,
          `  Schema Name: ${schemaName}`,
          `  Display Name: ${displayName}`,
          `  Precision: ${opts.precision}`,
          `  Range: ${opts.min} to ${opts.max}`,
          `  Required Level: ${opts.requiredLevel}`,
          `  Attribute ID: ${result.attributeId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-entity-lookup <referencingEntity> <referencedEntity> <relationshipSchemaName> <lookupSchemaName> <displayName>')
    .description('Create a lookup (N:1 relationship) column on a Dataverse entity')
    .option('--required-level <level>', 'Required level: None, ApplicationRequired, SystemRequired', 'None')
    .option('--description <desc>', 'Description for the lookup column')
    .option('--cascade-delete <mode>', 'Cascade delete behavior: NoCascade, RemoveLink, Restrict, Cascade', 'RemoveLink')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (
      referencingEntity: string,
      referencedEntity: string,
      relationshipSchemaName: string,
      lookupSchemaName: string,
      displayName: string,
      opts: {
        requiredLevel: string;
        description?: string;
        cascadeDelete: string;
        solution?: string;
      },
      command: Command,
    ) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getEntityService();
      const result = await service.createLookupAttribute(
        referencingEntity,
        referencedEntity,
        relationshipSchemaName,
        lookupSchemaName,
        displayName,
        opts.requiredLevel as 'None' | 'ApplicationRequired' | 'SystemRequired',
        opts.description,
        opts.cascadeDelete as 'NoCascade' | 'RemoveLink' | 'Restrict' | 'Cascade',
        undefined,
        opts.solution,
      );

      outputResult({
        fileName: `${referencingEntity}-create-lookup-${lookupSchemaName}`,
        data: result,
        summary: [
          `Created lookup on '${referencingEntity}':`,
          `  Lookup Schema Name: ${lookupSchemaName}`,
          `  Display Name: ${displayName}`,
          `  Points to: ${referencedEntity}`,
          `  Relationship Name: ${relationshipSchemaName}`,
          `  Required Level: ${opts.requiredLevel}`,
          `  Cascade Delete: ${opts.cascadeDelete}`,
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
