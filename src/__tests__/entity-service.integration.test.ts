import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createEntityService } from './test-helpers.js';
import type { EntityService } from '../services/entity-service.js';

describe.skipIf(!hasCredentials())('EntityService (integration)', () => {
  let service: EntityService;

  beforeAll(() => {
    service = createEntityService();
  });

  it('getEntityMetadata returns metadata for account', async () => {
    const result = await service.getEntityMetadata('account');
    expect(result).toBeDefined();
    expect(result.LogicalName).toBe('account');
    expect(result).not.toHaveProperty('Privileges');
  });

  it('getEntityAttributes returns filtered attributes for account', async () => {
    const result = await service.getEntityAttributes('account');
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    expect(result.value.length).toBeGreaterThan(0);

    // Verify yominame attributes are filtered out
    const yomiAttrs = result.value.filter(
      (a: any) => a.LogicalName?.endsWith('yominame')
    );
    expect(yomiAttrs).toHaveLength(0);
  });

  it('getEntityAttribute returns specific attribute', async () => {
    const result = await service.getEntityAttribute('account', 'name');
    expect(result).toBeDefined();
    expect(result.LogicalName).toBe('name');
  });

  it('getEntityOneToManyRelationships returns relationships', async () => {
    const result = await service.getEntityOneToManyRelationships('account');
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);

    // Verify msdyn_ and adx_ are filtered out
    const excluded = result.value.filter(
      (r: any) =>
        r.ReferencingEntity?.startsWith('msdyn_') ||
        r.ReferencingEntity?.startsWith('adx_')
    );
    expect(excluded).toHaveLength(0);
  });

  it('getEntityManyToManyRelationships returns relationships', async () => {
    const result = await service.getEntityManyToManyRelationships('account');
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
  });

  it('getEntityRelationships returns combined relationships', async () => {
    const result = await service.getEntityRelationships('account');
    expect(result).toBeDefined();
    expect(result.oneToMany).toBeDefined();
    expect(result.oneToMany.value).toBeInstanceOf(Array);
    expect(result.manyToMany).toBeDefined();
    expect(result.manyToMany.value).toBeInstanceOf(Array);
  });
});
