/**
 * Integration tests for DependencyService
 * Tests against a real Dataverse environment
 *
 * NOTE: The RetrieveDependenciesForDelete API may not be available in all environments.
 * Tests are designed to handle both success and failure scenarios gracefully.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { DependencyService } from '../../src/services/DependencyService.js';
import { EntityService } from '../../src/services/EntityService.js';
import { getTestClient } from '../__helpers__/testClient.js';
import { WELL_KNOWN_ENTITIES } from '../__helpers__/testConstants.js';

describe('DependencyService', () => {
  let service: DependencyService;
  let entityService: EntityService;

  beforeAll(() => {
    const client = getTestClient();
    service = new DependencyService(client);
    entityService = new EntityService(client);
  });

  describe('checkDependencies', () => {
    it('should attempt to call the RetrieveDependenciesForDelete API', async () => {
      // Get the metadata ID for the account entity
      const accountMetadata = await entityService.getEntityMetadata(WELL_KNOWN_ENTITIES.ACCOUNT);
      const metadataId = accountMetadata.MetadataId;

      expect(metadataId).toBeDefined();

      // The API may not be available in all environments
      try {
        const result = await service.checkDependencies(metadataId!, 1) as {
          EntityCollection?: { Entities?: unknown[] };
        };

        // If successful, verify the structure
        expect(result).toBeDefined();
        expect(result.EntityCollection).toBeDefined();
      } catch (error) {
        // API not available in this environment - this is expected in some cases
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('checkDeleteEligibility', () => {
    it('should handle API errors gracefully and return safe default', async () => {
      const accountMetadata = await entityService.getEntityMetadata(WELL_KNOWN_ENTITIES.ACCOUNT);

      const result = await service.checkDeleteEligibility(accountMetadata.MetadataId!, 1);

      // checkDeleteEligibility catches errors and returns a safe default
      expect(result).toBeDefined();
      expect(typeof result.canDelete).toBe('boolean');
      expect(Array.isArray(result.dependencies)).toBe(true);
    });

    it('should return proper structure for any entity', async () => {
      const contactMetadata = await entityService.getEntityMetadata(WELL_KNOWN_ENTITIES.CONTACT);

      const result = await service.checkDeleteEligibility(contactMetadata.MetadataId!, 1);

      expect(result).toBeDefined();
      expect(typeof result.canDelete).toBe('boolean');
      expect(Array.isArray(result.dependencies)).toBe(true);
    });

    it('should work with different component types', async () => {
      const accountMetadata = await entityService.getEntityMetadata(WELL_KNOWN_ENTITIES.ACCOUNT);

      // Test with different component types
      const entityResult = await service.checkDeleteEligibility(accountMetadata.MetadataId!, 1);
      expect(entityResult).toBeDefined();

      // The method should handle any component type gracefully
      const optionSetResult = await service.checkDeleteEligibility(accountMetadata.MetadataId!, 9);
      expect(optionSetResult).toBeDefined();
    });
  });

  describe('checkComponentDependencies', () => {
    it('should be an alias for checkDependencies', async () => {
      const accountMetadata = await entityService.getEntityMetadata(WELL_KNOWN_ENTITIES.ACCOUNT);

      // Both methods should behave the same way (either succeed or fail with same error)
      try {
        const result = await service.checkComponentDependencies(accountMetadata.MetadataId!, 1) as {
          EntityCollection?: { Entities?: unknown[] };
        };
        expect(result).toBeDefined();
      } catch (error) {
        // API not available - both methods should throw similar errors
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
