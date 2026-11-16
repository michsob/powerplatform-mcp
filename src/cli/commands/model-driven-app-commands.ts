import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';
import type { AppPage, AppTableGroup } from '../../services/model-driven-app-service.js';

const collect = (val: string, acc: string[]) => { acc.push(val); return acc; };

/** `Group/Title=web resource[,icon web resource]` → a page in a group. */
export function parsePageArg(raw: string): { group: string; page: AppPage } {
  const at = raw.indexOf('=');
  const slash = raw.lastIndexOf('/', at);
  if (at <= 0 || slash <= 0 || slash === at - 1) throw new Error(`--page must be 'Group/Title=web resource[,icon]' (got '${raw}').`);
  const [webResource, icon] = raw.slice(at + 1).split(',').map((s) => s.trim());
  if (!webResource) throw new Error(`--page '${raw.slice(0, at)}' names no web resource.`);
  return { group: raw.slice(0, slash).trim(), page: { title: raw.slice(slash + 1, at).trim(), webResource, icon: icon || undefined } };
}

/** Puts each page in its group, a group that only pages name coming first. */
export function addPages(groups: AppTableGroup[], pages: { group: string; page: AppPage }[]): AppTableGroup[] {
  const result = groups.map((g) => ({ ...g, pages: [...(g.pages ?? [])] }));
  const added: AppTableGroup[] = [];
  for (const { group, page } of pages) {
    let target = [...added, ...result].find((g) => g.title.toLowerCase() === group.toLowerCase());
    if (!target) { target = { title: group, tables: [], pages: [] }; added.push(target); }
    target.pages!.push(page);
  }
  return [...added, ...result];
}

/** `Title=table,table` → a group; the title is everything before the first `=`. */
export function parseGroupArg(raw: string): AppTableGroup {
  const at = raw.indexOf('=');
  if (at <= 0) throw new Error(`--group must be 'Title=table,table' (got '${raw}').`);
  const tables = raw.slice(at + 1).split(',').map((t) => t.trim()).filter(Boolean);
  if (tables.length === 0) throw new Error(`--group '${raw.slice(0, at)}' lists no tables.`);
  return { title: raw.slice(0, at).trim(), tables };
}

/** One line per warning, the same warning about several components (`<name>: <text>`) as one line naming them all. */
export function warningLines(warnings: { errorType: string; message: string }[]): string[] {
  const byText = new Map<string, string[]>();
  for (const w of warnings) {
    const at = w.message.indexOf(': ');
    const [name, text] = at > 0 ? [w.message.slice(0, at), w.message.slice(at + 2)] : ['', w.message];
    const key = `${w.errorType}: ${text}`;
    byText.set(key, [...(byText.get(key) ?? []), name].filter(Boolean));
  }
  return [...byText].map(([text, names]) => `  ⚠ ${text}${names.length > 0 ? ` (${names.join(', ')})` : ''}`);
}

export function registerModelDrivenAppCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('create-model-driven-app <uniqueName> <displayName>')
    .description(
      'Create a model-driven app over a list of tables and web resource pages: the app, its site map (a group per --group, ' +
      'a subarea per page and per table) and the tables as app components, validated and published. Safe to run again: ' +
      'the site map is rewritten and missing tables are added.',
    )
    .option('--table <logicalName>', 'A table, in the default group (repeatable)', collect, [] as string[])
    .option('--group <title=tables>', "A group of tables, 'Title=table,table' (repeatable)", collect, [] as string[])
    .option('--solution-tables', "Every table in --solution, in the default group (those not already listed)")
    .option('--page <group/title=webresource>', "A web resource page, 'Group/Title=web resource[,SVG icon web resource]', first in its group (repeatable)", collect, [] as string[])
    .option('--group-title <title>', 'Title of the default group', 'Tables')
    .option('--area-title <title>', "Title of the site map's area (defaults to the app's name)")
    .option('--description <desc>', 'App description')
    .option('--solution <name>', 'Solution unique name to create the app and its site map in')
    .option('--language-code <lcid>', "Language code (LCID) of the site map's titles (defaults to the base language)")
    .option('--no-publish', 'Leave the app unpublished')
    .action(async (uniqueName: string, displayName: string, opts: {
      table: string[];
      group: string[];
      page: string[];
      solutionTables?: boolean;
      groupTitle: string;
      areaTitle?: string;
      description?: string;
      solution?: string;
      languageCode?: string;
      publish: boolean;
    }, command: Command) => {
      if (opts.solutionTables && !opts.solution) throw new Error('--solution-tables needs --solution <name>.');
      const languageCode = opts.languageCode === undefined ? undefined : Number(opts.languageCode);
      if (languageCode !== undefined && (!Number.isInteger(languageCode) || languageCode <= 0)) {
        throw new Error(`--language-code must be a positive whole number (an LCID such as 1033), not '${opts.languageCode}'.`);
      }

      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getModelDrivenAppService();
      const groups = opts.group.map(parseGroupArg);
      const defaultTables = [...opts.table];
      if (opts.solutionTables) {
        const listed = new Set([...groups.flatMap((g) => g.tables), ...defaultTables].map((t) => t.toLowerCase()));
        defaultTables.push(...(await service.getSolutionTables(opts.solution!)).filter((t) => !listed.has(t)));
      }
      if (defaultTables.length > 0) groups.push({ title: opts.groupTitle, tables: defaultTables });
      const allGroups = addPages(groups, opts.page.map(parsePageArg));

      const result = await service.ensureApp({
        uniqueName,
        name: displayName,
        description: opts.description,
        groups: allGroups,
        areaTitle: opts.areaTitle,
        solutionUniqueName: opts.solution,
        languageCode,
        publish: opts.publish,
      });

      outputResult({
        fileName: `create-model-driven-app-${uniqueName}`,
        data: result,
        summary: [
          result.created ? 'Created model-driven app:' : 'Model-driven app already exists:',
          `  Name: ${displayName} (${result.uniqueName})`,
          `  App ID: ${result.appModuleId}`,
          `  Tables: ${result.tables.join(', ')}`,
          ...(opts.page.length ? [`  Pages: ${opts.page.map((p) => parsePageArg(p).page.title).join(', ')}`] : []),
          `  Tables added: ${result.tablesAdded.length > 0 ? result.tablesAdded.join(', ') : 'none'}`,
          `  Site map: ${result.siteMapChanged ? 'written' : 'unchanged'}`,
          ...warningLines(result.warnings),
          result.published ? `  Published: ${result.url}` : '  Not published (--no-publish)',
          opts.solution ? `  Solution: ${opts.solution}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
