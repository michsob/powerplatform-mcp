import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createConfigurationService } from './test-helpers.js';
import type { ConfigurationService } from '../services/configuration-service.js';

describe.skipIf(!hasCredentials())('ConfigurationService (integration)', () => {
  let service: ConfigurationService;

  beforeAll(() => {
    service = createConfigurationService();
  });

  it('getConnectionReferences returns connection references', async () => {
    const result = await service.getConnectionReferences();
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
  });

  it('getConnectionReferences respects maxRecords', async () => {
    const result = await service.getConnectionReferences({ maxRecords: 5 });
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    expect(result.value.length).toBeLessThanOrEqual(5);
  });

  it('getConnectionReferences filters managed only', async () => {
    const result = await service.getConnectionReferences({ managedOnly: true });
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    for (const ref of result.value) {
      expect(ref.ismanaged).toBe(true);
    }
  });

  it('getConnectionReferences filters orphaned refs with hasConnection false', async () => {
    const result = await service.getConnectionReferences({ hasConnection: false });
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    for (const ref of result.value) {
      expect(ref.connectionid).toBeNull();
    }
  });

  it('getEnvironmentVariables returns environment variables', async () => {
    const result = await service.getEnvironmentVariables();
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
  });

  it('getEnvironmentVariables respects maxRecords', async () => {
    const result = await service.getEnvironmentVariables({ maxRecords: 5 });
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    expect(result.value.length).toBeLessThanOrEqual(5);
  });

  it('getEnvironmentVariables filters managed only', async () => {
    const result = await service.getEnvironmentVariables({ managedOnly: true });
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    for (const v of result.value) {
      expect(v.ismanaged).toBe(true);
    }
  });
});
