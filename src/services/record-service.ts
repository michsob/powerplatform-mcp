import { PowerPlatformClient } from '../powerplatform-client.js';
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

  /**
   * Create a record. Dataverse returns 204 with an OData-EntityId header;
   * PowerPlatformClient.post extracts the ID into { entityId } for us.
   * @param entityNamePlural The plural name of the entity
   * @param data Record payload. Lookups use the @odata.bind convention, e.g.
   *   { "primarycontactid@odata.bind": "/contacts(<guid>)" }
   */
  async createRecord(entityNamePlural: string, data: Record<string, unknown>): Promise<{ entityId: string }> {
    return this.client.post<{ entityId: string }>(`api/data/v9.2/${entityNamePlural}`, data);
  }

  /**
   * Update a record via PATCH. Dataverse returns 204 No Content.
   * @param entityNamePlural The plural name of the entity
   * @param recordId The GUID of the record to update
   * @param data Partial payload with fields to update
   */
  async updateRecord(entityNamePlural: string, recordId: string, data: Record<string, unknown>): Promise<void> {
    await this.client.patch(`api/data/v9.2/${entityNamePlural}(${recordId})`, data);
  }

  /**
   * Delete a record.
   * @param entityNamePlural The plural name of the entity
   * @param recordId The GUID of the record to delete
   */
  async deleteRecord(entityNamePlural: string, recordId: string): Promise<void> {
    await this.client.delete(`api/data/v9.2/${entityNamePlural}(${recordId})`);
  }

  /**
   * Associate two records across a navigation property (N:N or 1:N).
   * POSTs to /api/data/v9.2/{entity}(id)/{nav}/$ref with @odata.bind payload.
   * @param entityNamePlural The plural name of the primary entity
   * @param recordId GUID of the primary record
   * @param navigationProperty Name of the navigation property (from entity metadata)
   * @param relatedEntityNamePlural Plural name of the related entity
   * @param relatedRecordId GUID of the record to link
   */
  async associateRecords(
    entityNamePlural: string,
    recordId: string,
    navigationProperty: string,
    relatedEntityNamePlural: string,
    relatedRecordId: string,
  ): Promise<void> {
    const body = {
      '@odata.id': `${this.client.organizationUrl}/api/data/v9.2/${relatedEntityNamePlural}(${relatedRecordId})`,
    };
    await this.client.post(
      `api/data/v9.2/${entityNamePlural}(${recordId})/${navigationProperty}/$ref`,
      body,
    );
  }

  /**
   * Disassociate two records across a navigation property.
   * DELETEs /api/data/v9.2/{entity}(id)/{nav}({relatedId})/$ref for collection-valued navs,
   * or /api/data/v9.2/{entity}(id)/{nav}/$ref for single-valued navs when relatedRecordId is omitted.
   * @param entityNamePlural The plural name of the primary entity
   * @param recordId GUID of the primary record
   * @param navigationProperty Name of the navigation property
   * @param relatedRecordId Optional GUID for collection-valued navs (N:N)
   */
  async disassociateRecords(
    entityNamePlural: string,
    recordId: string,
    navigationProperty: string,
    relatedRecordId?: string,
  ): Promise<void> {
    const suffix = relatedRecordId ? `(${relatedRecordId})` : '';
    await this.client.delete(
      `api/data/v9.2/${entityNamePlural}(${recordId})/${navigationProperty}${suffix}/$ref`,
    );
  }
}
