import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createOptionSetService } from './test-helpers.js';
import type { OptionSetService } from '../services/optionset-service.js';

describe.skipIf(!hasCredentials())('OptionSetService (integration)', () => {
  let service: OptionSetService;

  beforeAll(() => {
    service = createOptionSetService();
  });

  it('getGlobalOptionSet returns budgetstatus option set', async () => {
    const result = await service.getGlobalOptionSet('budgetstatus');
    expect(result).toBeDefined();
    expect(result.Name).toBe('budgetstatus');
    expect(result.Options).toBeInstanceOf(Array);
    expect(result.Options.length).toBeGreaterThan(0);
  });
});
