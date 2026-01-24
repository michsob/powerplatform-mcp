/**
 * DependencyService
 *
 * Service for checking component dependencies.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../PowerPlatformClient.js';

export class DependencyService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Check component dependencies
   */
  async checkDependencies(
    componentId: string,
    componentType: number
  ): Promise<unknown> {
    return this.client.post(
      'api/data/v9.2/RetrieveDependenciesForDelete',
      {
        ObjectId: componentId,
        ComponentType: componentType,
      }
    );
  }

  /**
   * Check if component can be deleted
   */
  async checkDeleteEligibility(
    componentId: string,
    componentType: number
  ): Promise<{ canDelete: boolean; dependencies: unknown[] }> {
    try {
      const result = (await this.checkDependencies(
        componentId,
        componentType
      )) as { EntityCollection?: { Entities?: unknown[] } };
      const dependencies = result.EntityCollection?.Entities || [];

      return {
        canDelete: dependencies.length === 0,
        dependencies: dependencies,
      };
    } catch {
      return {
        canDelete: false,
        dependencies: [],
      };
    }
  }

  /**
   * Check dependencies for a specific component (alias for checkDependencies)
   */
  async checkComponentDependencies(
    componentId: string,
    componentType: number
  ): Promise<unknown> {
    return this.checkDependencies(componentId, componentType);
  }
}
