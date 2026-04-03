import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createSolutionService } from './test-helpers.js';
import type { SolutionService } from '../services/solution-service.js';

describe.skipIf(!hasCredentials())('SolutionService (integration)', () => {
  let service: SolutionService;

  beforeAll(() => {
    service = createSolutionService();
  });

  it('getPublishers returns non-readonly publishers', async () => {
    const result = await service.getPublishers();
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    expect(result.value.length).toBeGreaterThan(0);
  });

  it('getSolutions returns visible solutions', async () => {
    const result = await service.getSolutions();
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    expect(result.value.length).toBeGreaterThan(0);
  });

  it('getSolution returns a specific solution by unique name', async () => {
    // 'Default' solution exists in every Dataverse environment
    const result = await service.getSolution('Default');
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });

  it('getSolutionComponents returns components for a solution', async () => {
    const solutions = await service.getSolutions();
    if (solutions.value.length === 0) {
      console.log('No solutions found, skipping components test');
      return;
    }

    const uniqueName = (solutions.value[0] as any).uniquename;
    const result = await service.getSolutionComponents(uniqueName);
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
  });
});
