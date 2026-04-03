import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createDependencyService, createEntityService } from './test-helpers.js';
import type { DependencyService } from '../services/dependency-service.js';

describe.skipIf(!hasCredentials())('DependencyService (integration)', () => {
  let service: DependencyService;
  let entityMetadataId: string;

  beforeAll(async () => {
    service = createDependencyService();

    // Get an entity metadata ID to use for dependency checks
    const entityService = createEntityService();
    const metadata = await entityService.getEntityMetadata('account');
    entityMetadataId = metadata.MetadataId;
  });

  it('checkDependencies returns dependency info', async () => {
    // Component type 1 = Entity
    const result = await service.checkDependencies(entityMetadataId, 1);
    expect(result).toBeDefined();
  });

  it('checkDeleteEligibility returns eligibility result', async () => {
    const result = await service.checkDeleteEligibility(entityMetadataId, 1);
    expect(result).toBeDefined();
    expect(typeof result.canDelete).toBe('boolean');
    expect(result.dependencies).toBeInstanceOf(Array);
  });
});
