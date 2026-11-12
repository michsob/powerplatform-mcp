/**
 * DependencyService
 *
 * Service for checking component dependencies.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../powerplatform-client.js';
import { odataGuid, odataInteger } from '../odata.js';

interface DependencyResponse {
  value?: unknown[];
}

export class DependencyService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Check component dependencies
   *
   * RetrieveDependenciesForDelete is an unbound *function*, not an action, so it
   * is invoked with GET and parenthesised parameters. Posting to it returns
   * "No HTTP resource was found that matches the request URI". Parameters are
   * passed as aliases so the GUID needs no inline escaping.
   */
  async checkDependencies(
    componentId: string,
    componentType: number
  ): Promise<DependencyResponse> {
    return this.client.get<DependencyResponse>(
      `api/data/v9.2/RetrieveDependenciesForDelete(ObjectId=@p1,ComponentType=@p2)` +
        `?@p1=${odataGuid(componentId, 'componentId')}&@p2=${odataInteger(componentType, 'componentType')}`
    );
  }

  /**
   * Check if component can be deleted
   */
  async checkDeleteEligibility(
    componentId: string,
    componentType: number
  ): Promise<{ canDelete: boolean; dependencies: unknown[] }> {
    // A failed check is an error, not "cannot delete, no dependencies": that answer would look
    // like a result while saying nothing about why.
    const result = await this.checkDependencies(componentId, componentType);
    // The Web API returns an OData collection under `value`. Reading a
    // non-existent `EntityCollection.Entities` yielded an empty array, which
    // reported components with dependencies as safe to delete.
    const dependencies = result.value ?? [];

    return {
      canDelete: dependencies.length === 0,
      dependencies: dependencies,
    };
  }

  /**
   * Check dependencies for a specific component (alias for checkDependencies)
   */
  async checkComponentDependencies(
    componentId: string,
    componentType: number
  ): Promise<DependencyResponse> {
    return this.checkDependencies(componentId, componentType);
  }
}
