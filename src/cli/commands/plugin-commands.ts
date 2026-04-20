import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerPluginCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('plugin-packages')
    .description('List plugin packages in the environment')
    .option('--include-managed', 'Include managed packages')
    .option('--max <number>', 'Maximum records', '100')
    .action(async (opts: { includeManaged?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getPluginPackages(
        opts.includeManaged ?? false,
        parseInt(opts.max, 10),
      );

      const nameList = (result.packages as Array<{ name: string; version: string }>)
        .slice(0, 10)
        .map((p) => `${p.name} v${p.version}`)
        .join(', ');

      outputResult({
        fileName: 'plugin-packages',
        data: result,
        summary: [
          `Found ${result.totalCount} plugin packages.`,
          result.totalCount > 0 ? `Packages: ${nameList}${result.totalCount > 10 ? ', ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('register-plugin-package <filePath>')
    .description('Register a new plugin package (.nupkg) in Dataverse')
    .requiredOption('--name <name>', 'Display name for the package')
    .requiredOption('--unique-name <uniqueName>', 'Unique name for the package')
    .option('--pkg-version <version>', 'Package version', '1.0.0')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (filePath: string, opts: {
      name: string;
      uniqueName: string;
      pkgVersion: string;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();

      console.log(`Reading plugin package from ${filePath}...`);
      const content = readFileSync(filePath).toString('base64');

      console.log(`Uploading plugin package (${(content.length * 0.75 / 1024).toFixed(0)} KB)...`);
      const result = await service.registerPluginPackage({
        name: opts.name,
        uniqueName: opts.uniqueName,
        version: opts.pkgVersion,
        content,
        solutionName: opts.solution,
      });

      outputResult({
        fileName: `register-plugin-package-${opts.uniqueName}`,
        data: result,
        summary: [
          `Registered plugin package:`,
          `  Name: ${opts.name}`,
          `  Unique Name: ${opts.uniqueName}`,
          `  Version: ${opts.pkgVersion}`,
          `  Package ID: ${result.pluginPackageId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('update-plugin-package <filePath>')
    .description('Update an existing plugin package with new content')
    .requiredOption('--plugin-package-id <id>', 'ID of the existing plugin package')
    .option('--pkg-version <version>', 'New version string')
    .action(async (filePath: string, opts: {
      pluginPackageId: string;
      pkgVersion?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();

      console.log(`Reading plugin package from ${filePath}...`);
      const content = readFileSync(filePath).toString('base64');

      console.log(`Uploading updated plugin package (${(content.length * 0.75 / 1024).toFixed(0)} KB)...`);
      await service.updatePluginPackage({
        pluginPackageId: opts.pluginPackageId,
        content,
        version: opts.pkgVersion,
      });

      console.log(`Success: plugin package ${opts.pluginPackageId} updated`);
    });


  program
    .command('entity-pipeline <entityName>')
    .description('Get plugin pipeline for an entity, organized by message and stage')
    .option('--message <message>', 'Filter by message (Create, Update, Delete)')
    .option('--include-disabled', 'Include disabled steps')
    .action(async (entityName: string, opts: { message?: string; includeDisabled?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getEntityPluginPipeline(
        entityName,
        opts.message,
        opts.includeDisabled ?? false,
      );

      const suffix = opts.message ? `-${opts.message.toLowerCase()}` : '';

      // Count steps by stage
      const stages = { preValidation: 0, preOperation: 0, postOperation: 0 };
      for (const step of result.steps as Array<{ stage: number }>) {
        if (step.stage === 10) stages.preValidation++;
        else if (step.stage === 20) stages.preOperation++;
        else if (step.stage === 40) stages.postOperation++;
      }

      const orderPreview = (result.executionOrder as string[])
        .slice(0, 5)
        .map((name: string, i: number) => `    ${i + 1}. ${name}`);
      const moreCount = result.executionOrder.length - 5;

      outputResult({
        fileName: `${entityName}-plugin-pipeline${suffix}`,
        data: result,
        summary: [
          `Plugin pipeline for '${entityName}'${opts.message ? ` (${opts.message})` : ''}:`,
          `  Total steps: ${result.steps.length}`,
          `  Messages: ${result.messages.length}`,
          `  PreValidation: ${stages.preValidation}, PreOperation: ${stages.preOperation}, PostOperation: ${stages.postOperation}`,
          result.executionOrder.length > 0 ? `  Execution order:` : '',
          ...orderPreview,
          moreCount > 0 ? `    ... and ${moreCount} more` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('plugin-assemblies')
    .description('Get all plugin assemblies in the environment')
    .option('--include-managed', 'Include managed assemblies')
    .option('--max <number>', 'Maximum records', '100')
    .action(async (opts: { includeManaged?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getPluginAssemblies(
        opts.includeManaged ?? false,
        parseInt(opts.max, 10),
      );

      const nameList = (result.assemblies as Array<{ name: string }>)
        .slice(0, 10)
        .map((a) => a.name)
        .join(', ');

      outputResult({
        fileName: 'plugin-assemblies',
        data: result,
        summary: [
          `Found ${result.totalCount} plugin assemblies.`,
          `Assemblies: ${nameList}${result.totalCount > 10 ? ', ...' : ''}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('plugin-assembly <assemblyName>')
    .description('Get a plugin assembly with all types, steps, and images')
    .option('--include-disabled', 'Include disabled steps')
    .action(async (assemblyName: string, opts: { includeDisabled?: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getPluginAssemblyComplete(
        assemblyName,
        opts.includeDisabled ?? false,
      );

      const issues = result.validation.potentialIssues;

      outputResult({
        fileName: `plugin-assembly-${assemblyName.toLowerCase().replace(/\s+/g, '-')}`,
        data: result,
        summary: [
          `Plugin assembly: '${assemblyName}'`,
          `  Plugin Types: ${result.pluginTypes.length}`,
          `  Steps: ${result.steps.length}`,
          `  Has Async Steps: ${result.validation.hasAsyncSteps}`,
          `  Has Sync Steps: ${result.validation.hasSyncSteps}`,
          issues.length > 0 ? `  Issues: ${issues.join('; ')}` : '  Issues: None',
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('plugin-trace-logs')
    .description('Get plugin trace logs with filtering')
    .option('--entity <name>', 'Filter by entity name')
    .option('--message <name>', 'Filter by message (Create, Update, Delete)')
    .option('--correlation-id <id>', 'Filter by correlation ID')
    .option('--step-id <id>', 'Filter by plugin step ID')
    .option('--exceptions-only', 'Only show logs with exceptions')
    .option('--hours <number>', 'Hours to look back', '24')
    .option('--max <number>', 'Maximum records', '50')
    .action(async (opts: {
      entity?: string;
      message?: string;
      correlationId?: string;
      stepId?: string;
      exceptionsOnly?: boolean;
      hours: string;
      max: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getPluginTraceLogs({
        entityName: opts.entity,
        messageName: opts.message,
        correlationId: opts.correlationId,
        pluginStepId: opts.stepId,
        exceptionOnly: opts.exceptionsOnly ?? false,
        hoursBack: parseInt(opts.hours, 10),
        maxRecords: parseInt(opts.max, 10),
      });

      const exceptionCount = (result.logs as Array<{ parsed?: { hasException?: boolean } }>)
        .filter((log) => log.parsed?.hasException).length;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      outputResult({
        fileName: `plugin-trace-logs-${timestamp}`,
        data: result,
        summary: [
          `Plugin trace logs (last ${opts.hours}h):`,
          `  Total logs: ${result.totalCount}`,
          `  Exceptions: ${exceptionCount}`,
          opts.entity ? `  Entity filter: ${opts.entity}` : '',
          opts.message ? `  Message filter: ${opts.message}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('plugin-type <typeName>')
    .description('Look up a plugin type by its fully qualified class name')
    .action(async (typeName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const pluginType = await service.getPluginType(typeName);

      if (!pluginType) {
        console.error(`Plugin type '${typeName}' not found.`);
        process.exit(1);
      }

      outputResult({
        fileName: `plugin-type-${typeName.replace(/\./g, '-')}`,
        data: pluginType,
        summary: [
          `Plugin Type: ${pluginType.typename}`,
          `  ID: ${pluginType.plugintypeid}`,
          `  Assembly: ${pluginType.assemblyname ?? 'N/A'}`,
          `  Friendly Name: ${pluginType.friendlyname ?? 'N/A'}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('sdk-message <messageName>')
    .description('Look up an SDK message by name (e.g. Create, Update, br_SyncProperties)')
    .action(async (messageName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const message = await service.getSdkMessage(messageName);

      if (!message) {
        console.error(`SDK message '${messageName}' not found.`);
        process.exit(1);
      }

      outputResult({
        fileName: `sdk-message-${messageName}`,
        data: message,
        summary: [
          `SDK Message: ${message.name}`,
          `  ID: ${message.sdkmessageid}`,
          `  Category: ${message.categoryname ?? 'N/A'}`,
          `  Active: ${message.isactive}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-plugin-step <name> <pluginTypeId> <sdkMessageId>')
    .description('Register a new plugin step (SDK message processing step)')
    .option('--stage <n>', 'Execution stage: 10=PreValidation, 20=PreOperation, 40=PostOperation', '40')
    .option('--mode <n>', 'Execution mode: 0=Synchronous, 1=Asynchronous', '0')
    .option('--rank <n>', 'Execution order', '1')
    .option('--supported-deployment <n>', '0=ServerOnly, 1=OfflineOnly, 2=Both', '0')
    .option('--description <desc>', 'Step description')
    .option('--configuration <config>', 'Unsecure configuration string')
    .option('--message-filter-id <id>', 'SDK message filter ID (entity filter)')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (name: string, pluginTypeId: string, sdkMessageId: string, opts: {
      stage: string;
      mode: string;
      rank: string;
      supportedDeployment: string;
      description?: string;
      configuration?: string;
      messageFilterId?: string;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const stage = parseInt(opts.stage, 10);
      const mode = parseInt(opts.mode, 10);
      const result = await service.createPluginStep({
        name, pluginTypeId, sdkMessageId,
        stage, mode,
        rank: parseInt(opts.rank, 10),
        supportedDeployment: parseInt(opts.supportedDeployment, 10),
        description: opts.description,
        configuration: opts.configuration,
        sdkMessageFilterId: opts.messageFilterId,
        solutionName: opts.solution,
      });

      const stageName = stage === 10 ? 'PreValidation' : stage === 20 ? 'PreOperation' : 'PostOperation';
      const modeName = mode === 0 ? 'Synchronous' : 'Asynchronous';

      outputResult({
        fileName: `create-plugin-step-${name.replace(/\s+/g, '-').toLowerCase()}`,
        data: result,
        summary: [
          `Created plugin step:`,
          `  Name: ${name}`,
          `  Stage: ${stageName} (${stage})`,
          `  Mode: ${modeName} (${mode})`,
          `  Step ID: ${result.stepId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-plugin-step-image <stepId>')
    .description('Register a PreImage or PostImage on an SDK message processing step')
    .option('--name <name>', 'Image name (plugin reads by this key)', 'PreImage')
    .option('--entity-alias <alias>', 'Entity alias (defaults to --name)')
    .option('--image-type <n>', '0=PreImage, 1=PostImage, 2=Both', '0')
    .option('--message-property-name <name>', 'Target property for CRUD messages', 'Target')
    .option('--attributes <csv>', 'Comma-separated schema names of columns to include')
    .action(async (stepId: string, opts: {
      name: string;
      entityAlias?: string;
      imageType: string;
      messagePropertyName: string;
      attributes?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const imageType = parseInt(opts.imageType, 10);
      const result = await service.createPluginStepImage({
        stepId,
        name: opts.name,
        entityAlias: opts.entityAlias,
        imageType,
        messagePropertyName: opts.messagePropertyName,
        attributes: opts.attributes,
      });

      const typeName = imageType === 0 ? 'PreImage' : imageType === 1 ? 'PostImage' : 'Both';
      outputResult({
        fileName: `create-plugin-step-image-${opts.name}`,
        data: result,
        summary: [
          `Created plugin step image:`,
          `  Name: ${opts.name}`,
          `  Type: ${typeName} (${imageType})`,
          `  Step: ${stepId}`,
          opts.attributes ? `  Attributes: ${opts.attributes}` : `  Attributes: (all)`,
          `  Image ID: ${result.imageId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('all-plugin-steps')
    .description('List all plugin SDK message processing steps across all assemblies')
    .option('--include-disabled', 'Include disabled steps (included by default)')
    .option('--max <number>', 'Maximum records', '10000')
    .action(async (opts: { includeDisabled?: boolean; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getPluginService();
      const result = await service.getAllPluginSteps({
        includeDisabled: opts.includeDisabled !== false,
        maxRecords: parseInt(opts.max, 10),
      });

      const enabledCount = result.steps.filter((s) => s.enabled).length;
      const disabledCount = result.steps.filter((s) => !s.enabled).length;

      outputResult({
        fileName: 'all-plugin-steps',
        data: result,
        summary: [
          `Found ${result.totalCount} plugin steps:`,
          `  Enabled: ${enabledCount}, Disabled: ${disabledCount}`,
        ].join('\n'),
      }, ctx.environmentName);
    });
}
