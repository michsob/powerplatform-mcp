import { PowerPlatformClient } from '../powerplatform-client.js';
import { expectAll, fetchCapped, odataGuid, odataInteger, odataString, type Truncation } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';

/**
 * Service for web resource operations.
 * Handles listing, retrieving, and creating web resources.
 *
 * Web resource type values (per Microsoft docs):
 *   1=HTML, 2=CSS, 3=JavaScript, 4=XML, 5=PNG,
 *   6=JPG, 7=GIF, 8=Silverlight (XAP), 9=Style Sheet (XSL),
 *   10=ICO, 11=Vector (SVG), 12=String (RESX)
 */
/** The web resource type for a file extension (lower case, with the dot). */
export const WEB_RESOURCE_TYPE_BY_EXTENSION: Readonly<Record<string, number>> = {
  '.htm': 1, '.html': 1, '.css': 2, '.js': 3, '.xml': 4, '.png': 5, '.jpg': 6, '.jpeg': 6, '.gif': 7,
  '.xap': 8, '.xsl': 9, '.xslt': 9, '.ico': 10, '.svg': 11, '.resx': 12,
};

export interface WebResourceFile {
  /** The web resource's name (`contoso_/app/page.html`). */
  name: string;
  displayName: string;
  webResourceType: number;
  /** The content, base64. */
  content: string;
}

export interface PushedWebResource {
  name: string;
  webResourceId: string;
  status: 'created' | 'updated' | 'unchanged';
}

export class WebResourceService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create or update web resources from files: a file whose content differs from the web resource's latest (published or
   * not) is written, a new one is created, an unchanged one is left alone; then the written ones are published together.
   * With a solution, every one of them is in it afterwards. A web resource of another type than its file is refused before
   * any write.
   */
  async pushWebResources(
    files: WebResourceFile[],
    options: { solutionName?: string; publish?: boolean } = {},
  ): Promise<{ results: PushedWebResource[]; published: boolean }> {
    const existing = new Map<string, { webresourceid: string; content?: string; webresourcetype: number }>();
    for (const file of files) {
      const row = await this.getLatestWebResource(file.name);
      if (row && row.webresourcetype !== file.webResourceType) {
        throw new Error(`Web resource '${file.name}' is of type ${row.webresourcetype}, not ${file.webResourceType}: a type cannot change.`);
      }
      if (row) existing.set(file.name, row);
    }

    const results: PushedWebResource[] = [];
    for (const file of files) {
      const row = existing.get(file.name);
      if (!row) {
        const created = await this.upsertWebResource({ ...file, solutionName: options.solutionName });
        results.push({ name: file.name, webResourceId: created.webResourceId, status: 'created' });
      } else if ((row.content ?? '') !== file.content) {
        await this.updateWebResource(row.webresourceid, file.content, options.solutionName);
        results.push({ name: file.name, webResourceId: row.webresourceid, status: 'updated' });
      } else {
        if (options.solutionName) {
          await this.client.post('api/data/v9.2/AddSolutionComponent', {
            ComponentId: odataGuid(row.webresourceid, 'webresourceid'),
            ComponentType: 61,
            SolutionUniqueName: options.solutionName,
            AddRequiredComponents: false,
          });
        }
        results.push({ name: file.name, webResourceId: row.webresourceid, status: 'unchanged' });
      }
    }

    const written = results.filter((r) => r.status !== 'unchanged');
    const publish = (options.publish ?? true) && written.length > 0;
    if (publish) {
      await this.client.post('api/data/v9.2/PublishXml', {
        ParameterXml: `<importexportxml><webresources>${written.map((r) => `<webresource>${odataGuid(r.webResourceId, 'webResourceId')}</webresource>`).join('')}</webresources></importexportxml>`,
      });
    }
    return { results, published: publish };
  }

  /** A web resource as it stands, published or not: the plain read returns the published content only. */
  private async getLatestWebResource(name: string): Promise<{ webresourceid: string; content?: string; webresourcetype: number } | null> {
    const result = await this.client.get<ApiCollectionResponse<{ webresourceid: string; name: string; content?: string; webresourcetype: number }>>(
      `api/data/v9.2/webresourceset/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?$select=webresourceid,name,content,webresourcetype&$filter=name eq ${odataString(name)}`,
    );
    const rows = expectAll(result.value ?? [], (r) => String(r.name).toLowerCase() === name.toLowerCase(), `name eq '${name}'`);
    return rows[0] ?? null;
  }

  /**
   * Get a list of web resources with optional filtering.
   * @param options Optional filters and pagination
   */
  async getWebResources(options?: {
    maxRecords?: number;
    webResourceType?: number;
    nameFilter?: string;
  }): Promise<ApiCollectionResponse<Record<string, unknown>> & Truncation> {
    const maxRecords = options?.maxRecords ?? 100;

    const selectProperties = [
      'webresourceid',
      'name',
      'displayname',
      'webresourcetype',
      'description',
      'ismanaged',
      'modifiedon',
    ].join(',');

    const filters: string[] = [];
    if (options?.webResourceType !== undefined) {
      filters.push(`webresourcetype eq ${odataInteger(options.webResourceType, 'webResourceType')}`);
    }
    if (options?.nameFilter) {
      filters.push(`contains(name,${odataString(options.nameFilter)})`);
    }

    let url = `api/data/v9.2/webresourceset?$select=${selectProperties}&$orderby=name`;
    if (filters.length > 0) {
      url += `&$filter=${filters.join(' and ')}`;
    }

    const { rows, ...truncation } = await fetchCapped<Record<string, unknown>>(this.client, url, maxRecords);
    return { value: rows, ...truncation };
  }

  /**
   * Get a single web resource by its exact name.
   * Returns the first matching web resource, or null if not found.
   * @param name The exact name of the web resource
   */
  async getWebResource(name: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/webresourceset?$filter=name eq ${odataString(name)}&$top=1`
    );
    // upsertWebResource overwrites what this returns, so a row that is not the one asked for
    // (a filter that did not apply) must never come back from here.
    const rows = expectAll(result.value ?? [], (r) => String(r.name).toLowerCase() === name.toLowerCase(), `name eq '${name}'`);
    return rows[0] ?? null;
  }

  /**
   * Create a new web resource.
   * @param options The web resource properties
   */
  async createWebResource(options: {
    name: string;
    displayName: string;
    webResourceType: number;
    content: string;
    description?: string;
    solutionName?: string;
  }): Promise<{ webResourceId: string }> {
    const body: Record<string, unknown> = {
      name: options.name,
      displayname: options.displayName,
      webresourcetype: options.webResourceType,
      content: options.content,
    };

    if (options.description) {
      body.description = options.description;
    }

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/webresourceset',
      body,
      headers,
    );

    return { webResourceId: result?.entityId ?? 'created' };
  }

  /**
   * Update an existing web resource's content by id.
   * Only the `content` field is touched — display name, type, etc. are left alone.
   */
  async updateWebResource(webResourceId: string, content: string, solutionName?: string): Promise<void> {
    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    await this.client.patch(
      `api/data/v9.2/webresourceset(${odataGuid(webResourceId, 'webResourceId')})`,
      { content },
      headers,
    );
  }

  /**
   * Create a new web resource, or update the content of an existing one with the
   * same name. Returns the web resource id either way. Idempotent across re-runs.
   */
  async upsertWebResource(options: {
    name: string;
    displayName: string;
    webResourceType: number;
    content: string;
    description?: string;
    solutionName?: string;
  }): Promise<{ webResourceId: string; created: boolean }> {
    const existing = await this.getWebResource(options.name);
    if (existing) {
      const id = existing.webresourceid as string;
      await this.updateWebResource(id, options.content, options.solutionName);
      return { webResourceId: id, created: false };
    }

    const created = await this.createWebResource(options);
    let id = created.webResourceId;
    if (id === 'created') {
      const refetched = await this.getWebResource(options.name);
      id = (refetched?.webresourceid as string) ?? id;
    }
    return { webResourceId: id, created: true };
  }
}
