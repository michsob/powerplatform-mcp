import { PowerPlatformClient } from '../PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../models/index.js';

/**
 * Service for record operations.
 * Handles CRUD operations on Dataverse records.
 */
export class RecordService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get a specific record by entity name (plural) and ID
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param recordId The GUID of the record
   * @returns The record data
   */
  async getRecord(entityNamePlural: string, recordId: string): Promise<any> {
    return this.client.get(`api/data/v9.2/${entityNamePlural}(${recordId})`);
  }

  /**
   * Query records using entity name (plural) and a filter expression
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param filter OData filter expression (e.g., "name eq 'test'")
   * @param maxRecords Maximum number of records to retrieve (default: 50)
   * @returns Filtered list of records
   */
  async queryRecords(entityNamePlural: string, filter: string, maxRecords: number = 50): Promise<ApiCollectionResponse<any>> {
    return this.client.get<ApiCollectionResponse<any>>(
      `api/data/v9.2/${entityNamePlural}?$filter=${encodeURIComponent(filter)}&$top=${maxRecords}`
    );
  }
}
