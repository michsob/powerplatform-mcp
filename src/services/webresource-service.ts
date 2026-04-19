import { PowerPlatformClient } from '../powerplatform-client.js';
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
export class WebResourceService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get a list of web resources with optional filtering.
   * @param options Optional filters and pagination
   */
  async getWebResources(options?: {
    maxRecords?: number;
    webResourceType?: number;
    nameFilter?: string;
  }): Promise<ApiCollectionResponse<Record<string, unknown>>> {
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
      filters.push(`webresourcetype eq ${options.webResourceType}`);
    }
    if (options?.nameFilter) {
      filters.push(`contains(name,'${options.nameFilter}')`);
    }

    let url = `api/data/v9.2/webresourceset?$select=${selectProperties}&$orderby=name&$top=${maxRecords}`;
    if (filters.length > 0) {
      url += `&$filter=${filters.join(' and ')}`;
    }

    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(url);
  }

  /**
   * Get a single web resource by its exact name.
   * Returns the first matching web resource, or null if not found.
   * @param name The exact name of the web resource
   */
  async getWebResource(name: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/webresourceset?$filter=name eq '${name}'&$top=1`
    );
    return result.value && result.value.length > 0 ? result.value[0] : null;
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
      `api/data/v9.2/webresourceset(${webResourceId})`,
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
