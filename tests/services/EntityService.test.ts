/**
 * Integration tests for EntityService
 * Tests against a real Dataverse environment
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { EntityService } from '../../src/services/EntityService.js';
import { getTestClient } from '../__helpers__/testClient.js';
import { WELL_KNOWN_ENTITIES } from '../__helpers__/testConstants.js';

describe('EntityService', () => {
  let service: EntityService;

  beforeAll(() => {
    service = new EntityService(getTestClient());
  });

  describe('getEntityMetadata', () => {
    it('should fetch entity metadata for account', async () => {
      const result = await service.getEntityMetadata(WELL_KNOWN_ENTITIES.ACCOUNT);

      expect(result.LogicalName).toBe('account');
      expect(result.DisplayName).toBeDefined();
      expect(result.SchemaName).toBe('Account');
    });

    it('should fetch entity metadata for contact', async () => {
      const result = await service.getEntityMetadata(WELL_KNOWN_ENTITIES.CONTACT);

      expect(result.LogicalName).toBe('contact');
      expect(result.DisplayName).toBeDefined();
    });

    it('should not include Privileges property in response', async () => {
      const result = await service.getEntityMetadata(WELL_KNOWN_ENTITIES.ACCOUNT);

      expect(result).not.toHaveProperty('Privileges');
    });
  });

  describe('getEntityAttributes', () => {
    it('should fetch attributes for account entity', async () => {
      const result = await service.getEntityAttributes(WELL_KNOWN_ENTITIES.ACCOUNT);

      expect(result.value).toBeDefined();
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value.length).toBeGreaterThan(0);

      // Check that common attributes are present
      const logicalNames = result.value.map((a: any) => a.LogicalName);
      expect(logicalNames).toContain('accountid');
      expect(logicalNames).toContain('name');
    });

    it('should filter out yominame attributes', async () => {
      const result = await service.getEntityAttributes(WELL_KNOWN_ENTITIES.CONTACT);

      const logicalNames = result.value.map((a: any) => a.LogicalName);
      const yominameAttrs = logicalNames.filter((name: string) => name.endsWith('yominame'));
      expect(yominameAttrs).toHaveLength(0);
    });

    it('should filter out *name attributes when base attribute exists', async () => {
      const result = await service.getEntityAttributes(WELL_KNOWN_ENTITIES.ACCOUNT);

      const logicalNames = result.value.map((a: any) => a.LogicalName);

      // parentaccountid should exist, but parentaccountidname should be filtered
      if (logicalNames.includes('parentaccountid')) {
        expect(logicalNames).not.toContain('parentaccountidname');
      }

      // primarycontactid should exist, but primarycontactidname should be filtered
      if (logicalNames.includes('primarycontactid')) {
        expect(logicalNames).not.toContain('primarycontactidname');
      }
    });
  });

  describe('getEntityAttribute', () => {
    it('should fetch a specific attribute', async () => {
      const result = await service.getEntityAttribute(WELL_KNOWN_ENTITIES.ACCOUNT, 'name');

      expect(result.LogicalName).toBe('name');
      expect(result.DisplayName).toBeDefined();
      expect(result.AttributeType).toBeDefined();
    });

    it('should fetch the accountid attribute', async () => {
      const result = await service.getEntityAttribute(WELL_KNOWN_ENTITIES.ACCOUNT, 'accountid');

      expect(result.LogicalName).toBe('accountid');
      expect(result.AttributeType).toBe('Uniqueidentifier');
    });
  });

  describe('getEntityOneToManyRelationships', () => {
    it('should fetch one-to-many relationships for account', async () => {
      const result = await service.getEntityOneToManyRelationships(WELL_KNOWN_ENTITIES.ACCOUNT);

      expect(result.value).toBeDefined();
      expect(Array.isArray(result.value)).toBe(true);
      // Account entity has many 1:N relationships
      expect(result.value.length).toBeGreaterThan(0);
    });

    it('should filter out msdyn_ prefixed entities', async () => {
      const result = await service.getEntityOneToManyRelationships(WELL_KNOWN_ENTITIES.ACCOUNT);

      const referencingEntities = result.value.map((r: any) => r.ReferencingEntity);
      const msdynEntities = referencingEntities.filter((e: string) => e.startsWith('msdyn_'));
      expect(msdynEntities).toHaveLength(0);
    });

    it('should filter out adx_ prefixed entities', async () => {
      const result = await service.getEntityOneToManyRelationships(WELL_KNOWN_ENTITIES.ACCOUNT);

      const referencingEntities = result.value.map((r: any) => r.ReferencingEntity);
      const adxEntities = referencingEntities.filter((e: string) => e.startsWith('adx_'));
      expect(adxEntities).toHaveLength(0);
    });
  });

  describe('getEntityManyToManyRelationships', () => {
    it('should fetch many-to-many relationships for account', async () => {
      const result = await service.getEntityManyToManyRelationships(WELL_KNOWN_ENTITIES.ACCOUNT);

      expect(result.value).toBeDefined();
      expect(Array.isArray(result.value)).toBe(true);
    });
  });

  describe('getEntityRelationships', () => {
    it('should fetch both one-to-many and many-to-many relationships', async () => {
      const result = await service.getEntityRelationships(WELL_KNOWN_ENTITIES.ACCOUNT);

      expect(result.oneToMany).toBeDefined();
      expect(result.manyToMany).toBeDefined();
      expect(result.oneToMany.value).toBeDefined();
      expect(result.manyToMany.value).toBeDefined();
    });
  });
});
