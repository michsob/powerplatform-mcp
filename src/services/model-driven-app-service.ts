/**
 * ModelDrivenAppService
 *
 * Model-driven apps (appmodule) built from a list of tables and pages: the app, its site map (one area, a group per list,
 * a subarea per page and per table) and the tables as app components, validated and published. A page is a web resource
 * (an HTML page) shown in the app.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import { expectAll, odataGuid, odataIdentifier, odataString } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';

/** The icon every new app gets in the app designer (msdyn_/Images/AppModule_Default_Icon.png). */
export const DEFAULT_APP_ICON_ID = '953b9fac-1e5e-e611-80d6-00155ded156f';

const APP_COMPONENT_TABLE = 1;
const APP_COMPONENT_SITEMAP = 62;

export interface AppPage {
  /** The page's title in the site map. */
  title: string;
  /** The web resource the page shows (`contoso_/app/overview.html`). */
  webResource: string;
  /** An SVG web resource for the page's icon. */
  icon?: string;
}

export interface AppTableGroup {
  /** The group's title in the site map. */
  title: string;
  /** Table logical names, in the order the site map shows them, after the group's pages. */
  tables: string[];
  /** Web resource pages, shown first in the group. */
  pages?: AppPage[];
}

export interface EnsureModelDrivenAppOptions {
  /** The app's unique name, with the publisher prefix (`contoso_Sales`). */
  uniqueName: string;
  /** The name users see. */
  name: string;
  description?: string;
  /** The site map's groups of tables. */
  groups: AppTableGroup[];
  /** The site map area's title (default: the app's name). */
  areaTitle?: string;
  /** The solution the app and its site map are created in. */
  solutionUniqueName?: string;
  /** LCID of the site map's titles (default: the organization's base language). */
  languageCode?: number;
  /** Publish the app and its site map (default: true). */
  publish?: boolean;
}

export interface AppValidationIssue {
  errorType: string;
  message: string;
}

export interface EnsureModelDrivenAppResult {
  appModuleId: string;
  uniqueName: string;
  /** False when the app already existed. */
  created: boolean;
  /** True when the site map was created or its XML changed. */
  siteMapChanged: boolean;
  /** Tables this call added as app components. */
  tablesAdded: string[];
  /** Every table the site map lists. */
  tables: string[];
  /** ValidateApp's warnings (errors throw before publishing). */
  warnings: AppValidationIssue[];
  published: boolean;
  /** Opens the app. */
  url: string;
}

interface AppRow {
  appmoduleid: string;
  appmoduleidunique: string;
  uniquename: string;
  name: string;
}

interface SiteMapRow {
  sitemapid: string;
  sitemapnameunique: string;
  sitemapxml?: string;
}

export class ModelDrivenAppService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * The app with these tables, created when there is none. Safe to run again: the site map is rewritten to the groups
   * given, tables missing from the app are added, and nothing is removed from the app's components. Every table is
   * checked before the first write; the app is validated and, when ValidateApp reports no error, published.
   */
  async ensureApp(options: EnsureModelDrivenAppOptions): Promise<EnsureModelDrivenAppResult> {
    const uniqueName = odataIdentifier(options.uniqueName, 'uniqueName');
    if (!options.name.trim()) throw new Error('The app needs a name.');
    const groups = options.groups
      .map((g) => ({
        title: g.title.trim(),
        tables: g.tables.map((t) => odataIdentifier(t.trim().toLowerCase(), 'table')),
        pages: (g.pages ?? []).map((p) => ({ title: p.title.trim(), webResource: p.webResource.trim(), icon: p.icon?.trim() || undefined })),
      }))
      .filter((g) => g.tables.length > 0 || g.pages.length > 0);
    const tables = [...new Set(groups.flatMap((g) => g.tables))];
    const pages = groups.flatMap((g) => g.pages);
    if (tables.length === 0) throw new Error('The app needs at least one table.');
    if (groups.some((g) => !g.title)) throw new Error('Every group of tables needs a title.');
    if (pages.some((p) => !p.title || !p.webResource)) throw new Error('Every page needs a title and a web resource.');
    const listedTwice = groups.flatMap((g) => g.tables).filter((t, i, all) => all.indexOf(t) !== i);
    if (listedTwice.length > 0) throw new Error(`A table can be listed once only: ${[...new Set(listedTwice)].join(', ')}.`);

    const tableIds = new Map<string, { metadataId: string; primaryId: string }>();
    for (const table of tables) {
      const metadata = await this.client.get<{ MetadataId?: string; PrimaryIdAttribute?: string }>(
        `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(table)})?$select=MetadataId,PrimaryIdAttribute`,
      );
      if (!metadata?.MetadataId || !metadata.PrimaryIdAttribute) throw new Error(`Table '${table}' was not found.`);
      tableIds.set(table, {
        metadataId: odataGuid(metadata.MetadataId, 'MetadataId'),
        primaryId: odataIdentifier(metadata.PrimaryIdAttribute, 'PrimaryIdAttribute'),
      });
    }

    for (const name of [...new Set(pages.flatMap((p) => (p.icon ? [p.webResource, p.icon] : [p.webResource])))]) {
      const found = await this.client.get<ApiCollectionResponse<{ name: string }>>(
        `api/data/v9.2/webresourceset?$select=name&$filter=name eq ${odataString(name)}`,
      );
      if (!found.value.some((w) => w.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Web resource '${name}' was not found (or is not published).`);
      }
    }

    const languageCode = options.languageCode ?? await this.baseLanguage();
    const siteMapXml = buildSiteMapXml(uniqueName, options.areaTitle?.trim() || options.name.trim(), groups, languageCode);
    const headers = options.solutionUniqueName ? { 'MSCRM.SolutionUniqueName': options.solutionUniqueName } : undefined;

    let app = await this.findApp(uniqueName);
    const created = !app;
    if (!app) {
      const body: Record<string, unknown> = {
        name: options.name.trim(),
        uniquename: uniqueName,
        webresourceid: DEFAULT_APP_ICON_ID,
        clienttype: 4, // Unified Interface
      };
      if (options.description) body.description = options.description;
      await this.client.post('api/data/v9.2/appmodules', body, headers);
      app = await this.findApp(uniqueName);
      if (!app) throw new Error(`Dataverse accepted the app '${uniqueName}' but it cannot be read back.`);
    }

    let siteMap = await this.findSiteMap(uniqueName);
    let siteMapChanged = false;
    if (!siteMap) {
      await this.client.post('api/data/v9.2/sitemaps', {
        sitemapname: options.name.trim(),
        sitemapnameunique: uniqueName,
        sitemapxml: siteMapXml,
        isappaware: true,
      }, headers);
      siteMap = await this.findSiteMap(uniqueName);
      if (!siteMap) throw new Error(`Dataverse accepted the site map '${uniqueName}' but it cannot be read back.`);
      siteMapChanged = true;
    } else if (siteMap.sitemapxml !== siteMapXml) {
      await this.client.patch(`api/data/v9.2/sitemaps(${odataGuid(siteMap.sitemapid, 'sitemapid')})`, { sitemapxml: siteMapXml }, headers);
      siteMapChanged = true;
    }

    // The published components only: components added since the last publish are not listed until it.
    const existing = (await this.client.getAll<{ componenttype: number; objectid: string }>(
      `api/data/v9.2/appmodulecomponents?$select=componenttype,objectid&$filter=_appmoduleidunique_value eq ${odataGuid(app.appmoduleidunique, 'appmoduleidunique')}`,
    )).value;
    const has = (type: number, id: string) => existing.some((c) => c.componenttype === type && c.objectid?.toLowerCase() === id.toLowerCase());
    const tablesAdded = tables.filter((t) => !has(APP_COMPONENT_TABLE, tableIds.get(t)!.metadataId));
    // A table is passed as a row of that table, its key set to the table's MetadataId: Dataverse takes the table from
    // the row's type. An `entity` row (entityid) adds the `entity` table itself, whatever its id.
    const components: Record<string, unknown>[] = tablesAdded.map((t) => {
      const { metadataId, primaryId } = tableIds.get(t)!;
      return { '@odata.type': `Microsoft.Dynamics.CRM.${t}`, [primaryId]: metadataId };
    });
    if (!has(APP_COMPONENT_SITEMAP, siteMap.sitemapid)) {
      components.push({ '@odata.type': 'Microsoft.Dynamics.CRM.sitemap', sitemapid: odataGuid(siteMap.sitemapid, 'sitemapid') });
    }
    if (components.length > 0) {
      await this.client.post('api/data/v9.2/AddAppComponents', { AppId: odataGuid(app.appmoduleid, 'appmoduleid'), Components: components });
    }

    const issues = await this.validate(app.appmoduleid);
    const errors = issues.filter((i) => i.errorType.toLowerCase() === 'error');
    if (errors.length > 0) {
      throw new Error(`ValidateApp found ${errors.length} error(s) in '${uniqueName}', so it was not published: ${errors.map((e) => e.message).join('; ')}`);
    }

    const publish = options.publish ?? true;
    if (publish) {
      await this.client.post('api/data/v9.2/PublishXml', {
        ParameterXml:
          `<importexportxml><appmodules><appmodule>${odataGuid(app.appmoduleid, 'appmoduleid')}</appmodule></appmodules>` +
          `<sitemaps><sitemap>${odataGuid(siteMap.sitemapid, 'sitemapid')}</sitemap></sitemaps></importexportxml>`,
      });
    }

    return {
      appModuleId: app.appmoduleid,
      uniqueName,
      created,
      siteMapChanged,
      tablesAdded,
      tables,
      warnings: issues.filter((i) => i.errorType.toLowerCase() !== 'error'),
      published: publish,
      url: `${this.client.organizationUrl}/main.aspx?appid=${app.appmoduleid}`,
    };
  }

  /** The logical names of the tables in a solution, in the order of their display names. */
  async getSolutionTables(solutionUniqueName: string): Promise<string[]> {
    const solutions = await this.client.get<ApiCollectionResponse<{ solutionid: string; uniquename: string }>>(
      `api/data/v9.2/solutions?$select=solutionid,uniquename&$filter=uniquename eq ${odataString(solutionUniqueName)}`,
    );
    const [solution] = expectAll(solutions.value, (s) => s.uniquename.toLowerCase() === solutionUniqueName.toLowerCase(), `solution ${solutionUniqueName}`);
    if (!solution) throw new Error(`Solution '${solutionUniqueName}' not found`);

    const components = await this.client.getAll<{ objectid: string }>(
      `api/data/v9.2/solutioncomponents?$select=objectid&$filter=componenttype eq 1 and _solutionid_value eq ${odataGuid(solution.solutionid, 'solutionid')}`,
    );
    const tables: { logicalName: string; displayName: string }[] = [];
    for (const c of components.value) {
      const metadata = await this.client.get<{ LogicalName: string; DisplayCollectionName?: { UserLocalizedLabel?: { Label?: string } } }>(
        `api/data/v9.2/EntityDefinitions(${odataGuid(c.objectid, 'objectid')})?$select=LogicalName,DisplayCollectionName`,
      );
      tables.push({ logicalName: metadata.LogicalName, displayName: metadata.DisplayCollectionName?.UserLocalizedLabel?.Label ?? metadata.LogicalName });
    }
    return tables.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((t) => t.logicalName);
  }

  private async findApp(uniqueName: string): Promise<AppRow | null> {
    const rows = await this.readLatest<AppRow>('appmodules',
      `$select=appmoduleid,appmoduleidunique,uniquename,name&$filter=uniquename eq ${odataString(uniqueName)}`);
    return expectAll(rows, (a) => a.uniquename.toLowerCase() === uniqueName.toLowerCase(), `app ${uniqueName}`)[0] ?? null;
  }

  private async findSiteMap(uniqueName: string): Promise<SiteMapRow | null> {
    const rows = await this.readLatest<SiteMapRow>('sitemaps',
      `$select=sitemapid,sitemapnameunique,sitemapxml&$filter=sitemapnameunique eq ${odataString(uniqueName)}`);
    return expectAll(rows, (s) => (s.sitemapnameunique ?? '').toLowerCase() === uniqueName.toLowerCase(), `site map ${uniqueName}`)[0] ?? null;
  }

  /**
   * The rows as they stand, published or not: a plain read returns only published apps and site maps, so a row created
   * and not yet published (or one with unpublished changes) is read with RetrieveUnpublishedMultiple, which wins.
   */
  private async readLatest<T>(entitySet: string, query: string): Promise<T[]> {
    const unpublished = await this.client.get<ApiCollectionResponse<T>>(
      `api/data/v9.2/${entitySet}/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?${query}`);
    if (unpublished.value.length > 0) return unpublished.value;
    return (await this.client.get<ApiCollectionResponse<T>>(`api/data/v9.2/${entitySet}?${query}`)).value;
  }

  private async validate(appModuleId: string): Promise<AppValidationIssue[]> {
    const result = await this.client.get<{
      AppValidationResponse?: {
        ValidationSuccess?: boolean;
        ValidationIssueList?: Array<{ ErrorType?: string; Message?: string | null; DisplayName?: string; RequiredComponents?: Array<{ SchemaName?: string }> }>;
      };
    }>(`api/data/v9.2/ValidateApp(AppModuleId=${odataGuid(appModuleId, 'appModuleId')})`);
    // An issue can come with no message, only the components it needs (a site map lists its tables).
    return (result.AppValidationResponse?.ValidationIssueList ?? []).map((i) => {
      const required = (i.RequiredComponents ?? []).map((c) => c.SchemaName).filter(Boolean);
      const message = i.Message || (required.length > 0 ? `needs ${required.join(', ')}` : 'no message');
      return { errorType: String(i.ErrorType ?? 'Error'), message: i.DisplayName ? `${i.DisplayName}: ${message}` : message };
    });
  }

  private async baseLanguage(): Promise<number> {
    const result = await this.client.get<ApiCollectionResponse<{ languagecode: number }>>('api/data/v9.2/organizations?$select=languagecode');
    return result.value[0]?.languagecode ?? 1033;
  }
}

/**
 * One area with the app's title, a group per list, in each group its pages (a subarea on the web resource, with its
 * title and icon) and then its tables (a subarea per table, showing the table's own name and icon).
 */
export function buildSiteMapXml(uniqueName: string, areaTitle: string, groups: AppTableGroup[], languageCode: number): string {
  const title = (text: string) => `<Titles><Title LCID="${languageCode}" Title="${escapeXml(text)}" /></Titles>`;
  let page = 0;
  const groupXml = groups.map((g, i) =>
    `<Group Id="group_${i + 1}" IsProfile="false">${title(g.title)}` +
    (g.pages ?? []).map((p) => `<SubArea Id="subarea_page_${++page}" Url="$webresource:${escapeXml(p.webResource)}"` +
      (p.icon ? ` VectorIcon="$webresource:${escapeXml(p.icon)}"` : '') + ` AvailableOffline="false" PassParams="false">${title(p.title)}</SubArea>`).join('') +
    g.tables.map((t) => `<SubArea Id="subarea_${t}" Entity="${t}" />`).join('') +
    '</Group>').join('');
  return `<SiteMap IntroducedVersion="7.0.0.0"><Area Id="area_${uniqueName.toLowerCase()}" ShowGroups="true">${title(areaTitle)}${groupXml}</Area></SiteMap>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
