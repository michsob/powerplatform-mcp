import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

/**
 * Service for web resource operations.
 * Handles listing, retrieving, and creating web resources.
 *
 * Web resource type values:
 *   1=HTML, 2=CSS, 3=JavaScript, 4=XML, 5=PNG,
 *   6=JPG, 7=GIF, 8=Silverlight, 9=StyleSheet,
 *   10=ICO, 11=Vector, 12=SVG
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
}
