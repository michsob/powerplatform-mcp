import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import type { FormLayoutSpec } from '../../services/form-layout.js';
import { outputResult } from '../output.js';

/** Parse "name:width" column arguments. */
function parseColumns(columns: string[]): { name: string; width?: number }[] {
  return columns.map(c => {
    const parts = c.split(':');
    return { name: parts[0], width: parts[1] ? parseInt(parts[1], 10) : undefined };
  });
}

function splitList(value?: string): string[] | undefined {
  const items = value?.split(',').map(s => s.trim()).filter(Boolean);
  return items?.length ? items : undefined;
}

export function registerFormViewCommands(program: Command, registry: EnvironmentRegistry): void {
  // ─── FORMS ─────────────────────────────────────────────────────────────────

  program
    .command('entity-forms <entityName>')
    .description('List forms for a Dataverse entity')
    .option('--type <n>', 'Form type: 2=Main, 5=QuickView, 6=QuickCreate, 7=Dashboard')
    .action(async (entityName: string, opts: { type?: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      const type = opts.type ? parseInt(opts.type, 10) : undefined;
      const forms = await service.getEntityForms(entityName, type);

      const typeLabel = (t: number) => ({ 2: 'Main', 5: 'QuickView', 6: 'QuickCreate', 7: 'Dashboard' }[t] ?? `Type ${t}`);
      const formList = forms.map(f => `  ${f.formid}  ${typeLabel(f.type).padEnd(12)} ${f.name}`).join('\n');

      outputResult({
        fileName: `${entityName}-forms`,
        data: forms,
        summary: [`Found ${forms.length} forms for '${entityName}':`, formList].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('entity-form-fields <formId>')
    .description('List fields currently on a Dataverse form')
    .action(async (formId: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      const fields = await service.getFormFields(formId);

      outputResult({
        fileName: `form-${formId}-fields`,
        data: fields,
        summary: [`Form ${formId} has ${fields.length} fields:`, ...fields.map(f => `  ${f}`)].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('add-form-field <entityName> <formId> <attributeName>')
    .description('Add a field to a Dataverse form')
    .action(async (entityName: string, formId: string, attributeName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      const result = await service.addFormField(formId, attributeName, entityName);

      outputResult({
        fileName: `form-${formId}-add-${attributeName}`,
        data: result,
        summary: result.added
          ? `Added '${attributeName}' to form ${formId} and published '${entityName}'.`
          : `'${attributeName}' is already on the form — no change.`,
      }, ctx.environmentName);
    });

  program
    .command('remove-form-field <entityName> <formId> <attributeName>')
    .description('Remove a field from a Dataverse form')
    .action(async (entityName: string, formId: string, attributeName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      const result = await service.removeFormField(formId, attributeName, entityName);

      outputResult({
        fileName: `form-${formId}-remove-${attributeName}`,
        data: result,
        summary: result.removed
          ? `Removed '${attributeName}' from form ${formId} and published '${entityName}'.`
          : `'${attributeName}' was not on the form — no change.`,
      }, ctx.environmentName);
    });

  program
    .command('set-form-layout <entityName> <formId> <layoutFile>')
    .description('Replace the tabs (and optionally the header) of a Dataverse form with the layout in a JSON file. Labels default to the columns\' display names; see the README for the file format.')
    .option('--dry-run', 'Build the formxml and save it to the cache without updating the form', false)
    .action(async (entityName: string, formId: string, layoutFile: string, opts: { dryRun: boolean }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      let spec: FormLayoutSpec;
      try {
        spec = JSON.parse(readFileSync(layoutFile, 'utf8')) as FormLayoutSpec;
      } catch (err) {
        throw new Error(`Could not read layout file '${layoutFile}': ${(err as Error).message}`);
      }
      const result = await service.setFormLayout(formId, entityName, spec, opts.dryRun);

      outputResult({
        fileName: `form-${formId}-layout${opts.dryRun ? '-dry-run' : ''}`,
        data: result,
        summary: [
          result.saved
            ? `Applied layout to form '${result.formName}' (${formId}) and published '${entityName}'.`
            : `Dry run — form '${result.formName}' (${formId}) not changed.`,
          `  Tabs: ${spec.tabs.map(t => t.name).join(', ')}`,
          `  Fields (${result.fields.length}): ${result.fields.join(', ')}`,
          result.headerFields ? `  Header: ${result.headerFields.join(', ') || '(removed)'}` : '',
          result.subgrids.length ? `  Subgrids: ${result.subgrids.join(', ')}` : '',
          result.notOnForm.length ? `  Custom columns not on the form: ${result.notOnForm.join(', ')}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  // ─── VIEWS ─────────────────────────────────────────────────────────────────

  program
    .command('entity-views <entityName>')
    .description('List views (saved queries) for a Dataverse entity')
    .action(async (entityName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      const views = await service.getEntityViews(entityName);

      const viewList = views.map(v =>
        `  ${v.savedqueryid}  ${v.isdefault ? '(default)' : '         '} ${v.name}`
      ).join('\n');

      outputResult({
        fileName: `${entityName}-views`,
        data: views,
        summary: [`Found ${views.length} views for '${entityName}':`, viewList].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('add-view-column <entityName> <viewId> <attributeName>')
    .description('Add a column to a Dataverse view')
    .option('--width <n>', 'Column width in pixels', '150')
    .action(async (entityName: string, viewId: string, attributeName: string, opts: { width: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      const result = await service.addViewColumn(viewId, attributeName, entityName, parseInt(opts.width, 10));

      outputResult({
        fileName: `view-${viewId}-add-${attributeName}`,
        data: result,
        summary: result.added
          ? `Added '${attributeName}' to view ${viewId} and published '${entityName}'.`
          : `'${attributeName}' is already in the view — no change.`,
      }, ctx.environmentName);
    });

  program
    .command('set-view-columns <entityName> <viewId> <columns...>')
    .description('Replace the entire column set of a Dataverse view. Columns are attribute names, optionally with :width (e.g. br_side:100 br_type:150).')
    .option('--order-by <attr>', 'Attribute to sort by (default: first column)')
    .option('--desc', 'Sort descending', false)
    .option('--find-columns <attrs>', 'Quick Find views only: comma-separated text or lookup columns the search box matches on')
    .action(async (entityName: string, viewId: string, columns: string[], opts: {
      orderBy?: string;
      desc: boolean;
      findColumns?: string;
    }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();

      const result = await service.setViewColumns(
        viewId, parseColumns(columns), entityName, opts.orderBy, opts.desc, splitList(opts.findColumns),
      );

      outputResult({
        fileName: `view-${viewId}-set-columns`,
        data: result,
        summary: [
          `Set ${result.columns.length} columns on view ${viewId}:`,
          ...result.columns.map(c => `  ${c}`),
          result.findColumns ? `Quick Find searches: ${result.findColumns.join(', ')}` : '',
          `Published '${entityName}'.`,
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-view <entityName> <name> <columns...>')
    .description('Create a public view, or update the view with the same name on the table. Columns are attribute names, optionally with :width.')
    .option('--order-by <attr>', 'Attribute to sort by (default: first column)')
    .option('--desc', 'Sort descending', false)
    .option('--description <text>', 'View description')
    .option('--state <state>', 'Records to include: active, inactive or all', 'active')
    .option('--filter-xml <xml>', 'Extra FetchXML <filter> element(s), combined with the state filter')
    .option('--solution <name>', 'Unmanaged solution to add the view to')
    .action(async (entityName: string, name: string, columns: string[], opts: {
      orderBy?: string;
      desc: boolean;
      description?: string;
      state: string;
      filterXml?: string;
      solution?: string;
    }, command: Command) => {
      if (!['active', 'inactive', 'all'].includes(opts.state)) {
        throw new Error(`--state must be active, inactive or all (got '${opts.state}').`);
      }
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      const result = await service.createView(entityName, name, parseColumns(columns), {
        orderBy: opts.orderBy,
        orderDescending: opts.desc,
        description: opts.description,
        state: opts.state as 'active' | 'inactive' | 'all',
        filterXml: opts.filterXml,
        solutionName: opts.solution,
      });

      outputResult({
        fileName: `view-${result.savedqueryid}-create`,
        data: result,
        summary: [
          `${result.created ? 'Created' : 'Updated existing'} view '${name}' (${result.savedqueryid}) on '${entityName}':`,
          ...result.columns.map(c => `  ${c}`),
          opts.solution ? `In solution '${opts.solution}'.` : '',
          `Published '${entityName}'.`,
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('remove-view-column <entityName> <viewId> <attributeName>')
    .description('Remove a column from a Dataverse view')
    .action(async (entityName: string, viewId: string, attributeName: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getFormViewService();
      const result = await service.removeViewColumn(viewId, attributeName, entityName);

      outputResult({
        fileName: `view-${viewId}-remove-${attributeName}`,
        data: result,
        summary: result.removed
          ? `Removed '${attributeName}' from view ${viewId} and published '${entityName}'.`
          : `'${attributeName}' was not in the view — no change.`,
      }, ctx.environmentName);
    });
}
