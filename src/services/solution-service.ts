/**
 * SolutionService
 *
 * Read-only service for querying solutions, publishers, solution components,
 * and exporting solutions.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

export class SolutionService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all non-readonly publishers in the environment.
   */
  async getPublishers(): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      'api/data/v9.2/publishers?$filter=isreadonly eq false'
    );
  }

  /**
   * Get all visible solutions, ordered by creation date descending.
   */
  async getSolutions(): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      'api/data/v9.2/solutions?$filter=isvisible eq true&$orderby=createdon desc'
    );
  }

  /**
   * Get a specific solution by its unique name.
   * Returns the first matching solution, or null if not found.
   */
  async getSolution(uniqueName: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/solutions?$filter=uniquename eq '${uniqueName}'&$top=1`
    );
    return result.value && result.value.length > 0 ? result.value[0] : null;
  }

  /**
   * Get all components in a solution, ordered by component type.
   * First resolves the solution by unique name, then fetches its components.
   */
  async getSolutionComponents(
    solutionUniqueName: string
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const solution = await this.getSolution(solutionUniqueName);
    if (!solution) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }

    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solution.solutionid}&$orderby=componenttype`
    );
  }

  /**
   * Export a solution as a base64-encoded package.
   * This is a read-only operation that serializes the solution for download.
   *
   * @param solutionName - The unique name of the solution to export
   * @param managed - Whether to export as a managed solution (default: false)
   */
  async exportSolution(
    solutionName: string,
    managed: boolean = false
  ): Promise<unknown> {
    return this.client.post(
      'api/data/v9.2/ExportSolution',
      {
        SolutionName: solutionName,
        Managed: managed,
        ExportAutoNumberingSettings: true,
        ExportCalendarSettings: true,
        ExportCustomizationSettings: true,
        ExportEmailTrackingSettings: true,
        ExportGeneralSettings: true,
        ExportMarketingSettings: true,
        ExportOutlookSynchronizationSettings: true,
        ExportRelationshipRoles: true,
        ExportIsvConfig: true,
        ExportSales: true,
        ExportExternalApplications: true,
      }
    );
  }
}
