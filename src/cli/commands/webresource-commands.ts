import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerWebResourceCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('web-resources')
    .description('List web resources in a Dataverse environment')
    .option('--type <n>', 'Filter by web resource type (1=HTML, 2=CSS, 3=JS, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=Silverlight, 9=StyleSheet, 10=ICO, 11=Vector, 12=SVG)')
    .option('--name <contains>', 'Filter web resources whose name contains this string')
    .option('--max <n>', 'Maximum number of records to return', '100')
    .action(async (opts: { type?: string; name?: string; max: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getWebResourceService();
      const result = await service.getWebResources({
        maxRecords: parseInt(opts.max, 10),
        webResourceType: opts.type ? parseInt(opts.type, 10) : undefined,
        nameFilter: opts.name,
      });
      const resources = result.value || [];

      const topItems = resources
        .slice(0, 10)
        .map((r: Record<string, unknown>) => `  ${r.name} (type: ${r.webresourcetype})`)
        .join('\n');

      outputResult({
        fileName: 'web-resources',
        data: result,
        summary: [
          `Found ${resources.length} web resources.`,
          resources.length > 0 ? topItems : '',
          resources.length > 10 ? `  + ${resources.length - 10} more in file` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('web-resource <name>')
    .description('Get a single web resource by its exact name')
    .action(async (name: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getWebResourceService();
      const webResource = await service.getWebResource(name);

      if (!webResource) {
        console.log(`Web resource '${name}' not found.`);
        return;
      }

      outputResult({
        fileName: `web-resource-${name.replace(/[/\\]/g, '_')}`,
        data: webResource,
        summary: [
          `Web Resource: ${webResource.name}`,
          `  Display Name: ${webResource.displayname ?? 'N/A'}`,
          `  Type: ${webResource.webresourcetype}`,
          `  Is Managed: ${webResource.ismanaged}`,
          `  Modified On: ${webResource.modifiedon}`,
          webResource.description ? `  Description: ${webResource.description}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-web-resource <name> <displayName> <filePath>')
    .description('Create a new web resource by uploading a file')
    .option('--type <n>', 'Web resource type (1=HTML, 2=CSS, 3=JS, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=Silverlight, 9=StyleSheet, 10=ICO, 11=Vector, 12=SVG)', '3')
    .option('--description <desc>', 'Description for the web resource')
    .option('--solution <name>', 'Solution unique name to add the component to')
    .action(async (name: string, displayName: string, filePath: string, opts: {
      type: string;
      description?: string;
      solution?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getWebResourceService();

      const fileContent = readFileSync(filePath);
      const base64Content = Buffer.from(fileContent).toString('base64');

      const result = await service.createWebResource({
        name,
        displayName,
        webResourceType: parseInt(opts.type, 10),
        content: base64Content,
        description: opts.description,
        solutionName: opts.solution,
      });

      outputResult({
        fileName: `create-web-resource-${name.replace(/[/\\]/g, '_')}`,
        data: result,
        summary: [
          `Created web resource '${name}':`,
          `  Display Name: ${displayName}`,
          `  Type: ${opts.type}`,
          `  File: ${filePath}`,
          `  Web Resource ID: ${result.webResourceId}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('set-entity-icon <entityName> <svgFilePath>')
    .description('Upload an SVG (or reuse existing) and set it as the entity icon in Dataverse')
    .option('--solution <name>', 'Solution unique name to add the webresource/entity to', 'borsocore')
    .option('--web-resource-name <name>', 'Web resource logical name (default: <entity>_icon.svg)')
    .option('--display-name <name>', 'Display name for the web resource (default: derived from entity)')
    .option('--no-publish', 'Skip publishing customizations after setting the icon')
    .action(async (entityName: string, svgFilePath: string, opts: {
      solution: string;
      webResourceName?: string;
      displayName?: string;
      publish: boolean;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const webResourceService = ctx.getWebResourceService();
      const entityService = ctx.getEntityService();
      const solutionService = ctx.getSolutionService();

      const name = opts.webResourceName ?? `${entityName}_icon.svg`;
      const displayName = opts.displayName ?? `${entityName} icon`;
      const base64 = Buffer.from(readFileSync(svgFilePath)).toString('base64');

      const { webResourceId, created } = await webResourceService.upsertWebResource({
        name,
        displayName,
        webResourceType: 11,
        content: base64,
        solutionName: opts.solution,
      });

      await entityService.setEntityIconVector(entityName, name, opts.solution);

      if (opts.publish !== false) {
        await solutionService.publishCustomizations(entityName);
      }

      outputResult({
        fileName: `set-entity-icon-${entityName}`,
        data: { webResourceId, webResourceName: name, entityName, created },
        summary: [
          `${created ? 'Created' : 'Updated'} web resource '${name}' (id: ${webResourceId})`,
          `Set ${entityName}.IconVectorName = '${name}'`,
          opts.publish !== false ? `Published customizations for '${entityName}'` : 'Skipped publish',
        ].join('\n'),
      }, ctx.environmentName);
    });
}
