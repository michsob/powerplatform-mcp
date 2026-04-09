import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerCustomApiCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('custom-apis')
    .description('List Custom API definitions in the environment')
    .option('--include-managed', 'Include managed Custom APIs')
    .option('--max <n>', 'Maximum records to return', '100')
    .action(async (opts: {
      includeManaged?: boolean;
      max: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getCustomApiService();
      const result = await service.getCustomApis({
        maxRecords: parseInt(opts.max, 10),
        includeManaged: opts.includeManaged,
      });
      const apis = result.value || [];

      const nameList = apis
        .slice(0, 10)
        .map((api: Record<string, unknown>) =>
          `${api.uniquename} - ${api.displayname || api.name} (managed: ${api.ismanaged})`
        )
        .join('\n    ');

      outputResult({
        fileName: 'custom-apis',
        data: result,
        summary: [
          `Found ${apis.length} Custom APIs:`,
          apis.length > 0 ? `  APIs:\n    ${nameList}${apis.length > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('custom-api <uniqueName>')
    .description('Get a single Custom API definition by unique name')
    .action(async (uniqueName: string, opts: Record<string, unknown>, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getCustomApiService();
      const result = await service.getCustomApi(uniqueName);

      if (!result) {
        outputResult({
          fileName: `custom-api-${uniqueName}`,
          data: null,
          summary: `Custom API '${uniqueName}' not found`,
        }, ctx.environmentName);
        return;
      }

      outputResult({
        fileName: `custom-api-${uniqueName}`,
        data: result,
        summary: [
          `Custom API '${uniqueName}':`,
          `  Display Name: ${result.displayname}`,
          `  Binding Type: ${result.bindingtype}`,
          `  Is Function: ${result.isfunction}`,
          `  Is Private: ${result.isprivate}`,
          `  Is Managed: ${result.ismanaged}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-custom-api <uniqueName> <displayName>')
    .description('Create a new Custom API definition')
    .option('--binding-type <n>', 'Binding type: 0=Global, 1=Entity, 2=EntityCollection', '0')
    .option('--bound-entity <name>', 'Bound entity logical name (required when binding type is 1 or 2)')
    .option('--is-function', 'Create as a function (default: action)')
    .option('--is-private', 'Create as a private Custom API')
    .option('--processing-type <n>', 'Processing step type: 0=None, 1=AsyncOnly, 2=SyncAndAsync', '0')
    .option('--plugin-type-id <id>', 'Plugin type ID to bind (runs at MainOperation)')
    .option('--plugin-type-name <name>', 'Plugin type class name to look up and bind (e.g. miejskinajem.Plugins.Hospitable.SyncProperties)')
    .option('--description <desc>', 'Description')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (uniqueName: string, displayName: string, opts: {
      bindingType: string;
      boundEntity?: string;
      isFunction?: boolean;
      isPrivate?: boolean;
      processingType: string;
      pluginTypeId?: string;
      pluginTypeName?: string;
      description?: string;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);

      // Resolve plugin type ID from name if provided
      let pluginTypeId = opts.pluginTypeId;
      if (!pluginTypeId && opts.pluginTypeName) {
        const pluginService = ctx.getPluginService();
        const pluginType = await pluginService.getPluginType(opts.pluginTypeName);
        if (!pluginType) {
          console.error(`Plugin type '${opts.pluginTypeName}' not found.`);
          process.exit(1);
        }
        pluginTypeId = pluginType.plugintypeid as string;
        console.log(`Resolved plugin type '${opts.pluginTypeName}' => ${pluginTypeId}`);
      }

      const service = ctx.getCustomApiService();
      const result = await service.createCustomApi({
        uniqueName,
        name: uniqueName,
        displayName,
        description: opts.description,
        bindingType: parseInt(opts.bindingType, 10),
        boundEntityLogicalName: opts.boundEntity,
        isFunction: opts.isFunction ?? false,
        isPrivate: opts.isPrivate ?? false,
        allowedCustomProcessingStepType: parseInt(opts.processingType, 10),
        pluginTypeId,
        solutionName: opts.solution,
      });

      outputResult({
        fileName: `create-custom-api-${uniqueName}`,
        data: result,
        summary: [
          `Created Custom API:`,
          `  Unique Name: ${uniqueName}`,
          `  Display Name: ${displayName}`,
          `  Binding Type: ${opts.bindingType}`,
          `  Is Function: ${opts.isFunction ?? false}`,
          pluginTypeId ? `  Plugin Type: ${opts.pluginTypeName ?? pluginTypeId}` : '',
          `  Custom API ID: ${result.customApiId}`,
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('custom-api-response-properties <customApiId>')
    .description('List response properties for a Custom API')
    .action(async (customApiId: string, opts: Record<string, unknown>, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getCustomApiService();
      const result = await service.getCustomApiResponseProperties(customApiId);
      const props = result.value || [];

      const nameList = props
        .slice(0, 10)
        .map((prop: Record<string, unknown>) =>
          `${prop.uniquename} - ${prop.displayname || prop.name} (type: ${prop.type}, optional: ${prop.isoptional})`
        )
        .join('\n    ');

      outputResult({
        fileName: `custom-api-response-properties-${customApiId}`,
        data: result,
        summary: [
          `Found ${props.length} response properties:`,
          props.length > 0 ? `  Properties:\n    ${nameList}${props.length > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-custom-api-response-property <customApiId> <uniqueName> <displayName>')
    .description('Create a response property for a Custom API')
    .option('--type <n>', 'Type code: 0=Boolean, 1=DateTime, 2=Decimal, 3=Entity, 4=EntityCollection, 5=EntityReference, 6=Float, 7=Integer, 8=Money, 9=Picklist, 10=String, 11=StringArray, 12=Guid', '10')
    .option('--description <desc>', 'Description')
    .option('--logical-entity <name>', 'Logical entity name (required for Entity, EntityCollection, EntityReference types)')
    .option('--optional', 'Mark this property as optional')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (customApiId: string, uniqueName: string, displayName: string, opts: {
      type: string;
      description?: string;
      logicalEntity?: string;
      optional?: boolean;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getCustomApiService();
      const result = await service.createCustomApiResponseProperty({
        customApiId,
        uniqueName,
        name: uniqueName,
        displayName,
        description: opts.description,
        type: parseInt(opts.type, 10),
        logicalEntityName: opts.logicalEntity,
        isOptional: opts.optional ?? false,
        solutionName: opts.solution,
      });

      outputResult({
        fileName: `create-response-property-${uniqueName}`,
        data: result,
        summary: [
          `Created response property:`,
          `  Unique Name: ${uniqueName}`,
          `  Display Name: ${displayName}`,
          `  Type: ${opts.type}`,
          `  Response Property ID: ${result.responsePropertyId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('custom-api-request-parameters <customApiId>')
    .description('List request parameters for a Custom API')
    .action(async (customApiId: string, opts: Record<string, unknown>, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getCustomApiService();
      const result = await service.getCustomApiRequestParameters(customApiId);
      const params = result.value || [];

      const nameList = params
        .slice(0, 10)
        .map((param: Record<string, unknown>) =>
          `${param.uniquename} - ${param.displayname || param.name} (type: ${param.type}, optional: ${param.isoptional})`
        )
        .join('\n    ');

      outputResult({
        fileName: `custom-api-request-parameters-${customApiId}`,
        data: result,
        summary: [
          `Found ${params.length} request parameters:`,
          params.length > 0 ? `  Parameters:\n    ${nameList}${params.length > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-custom-api-request-parameter <customApiId> <uniqueName> <displayName>')
    .description('Create a request parameter for a Custom API')
    .option('--type <n>', 'Type code: 0=Boolean, 1=DateTime, 2=Decimal, 3=Entity, 4=EntityCollection, 5=EntityReference, 6=Float, 7=Integer, 8=Money, 9=Picklist, 10=String, 11=StringArray, 12=Guid', '10')
    .option('--description <desc>', 'Description')
    .option('--logical-entity <name>', 'Logical entity name (required for Entity, EntityCollection, EntityReference types)')
    .option('--optional', 'Mark this parameter as optional')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (customApiId: string, uniqueName: string, displayName: string, opts: {
      type: string;
      description?: string;
      logicalEntity?: string;
      optional?: boolean;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getCustomApiService();
      const result = await service.createCustomApiRequestParameter({
        customApiId,
        uniqueName,
        name: uniqueName,
        displayName,
        description: opts.description,
        type: parseInt(opts.type, 10),
        logicalEntityName: opts.logicalEntity,
        isOptional: opts.optional ?? false,
        solutionName: opts.solution,
      });

      outputResult({
        fileName: `create-request-parameter-${uniqueName}`,
        data: result,
        summary: [
          `Created request parameter:`,
          `  Unique Name: ${uniqueName}`,
          `  Display Name: ${displayName}`,
          `  Type: ${opts.type}`,
          `  Request Parameter ID: ${result.requestParameterId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });
}
