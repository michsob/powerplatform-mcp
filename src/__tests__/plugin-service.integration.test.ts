import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createPluginService } from './test-helpers.js';
import type { PluginService } from '../services/plugin-service.js';

describe.skipIf(!hasCredentials())('PluginService (integration)', () => {
  let service: PluginService;

  beforeAll(() => {
    service = createPluginService();
  });

  it('getPluginAssemblies returns assemblies', async () => {
    const result = await service.getPluginAssemblies(false, 10);
    expect(result).toBeDefined();
    expect(typeof result.totalCount).toBe('number');
    expect(result.assemblies).toBeInstanceOf(Array);
  });

  it('getPluginAssemblyComplete returns assembly details', async () => {
    const list = await service.getPluginAssemblies(true, 5);
    if (list.assemblies.length === 0) {
      console.log('No plugin assemblies found, skipping detail test');
      return;
    }

    const assemblyName = (list.assemblies[0] as any).name;
    const result = await service.getPluginAssemblyComplete(assemblyName);
    expect(result).toBeDefined();
    expect(result.assembly).toBeDefined();
    expect(result.pluginTypes).toBeInstanceOf(Array);
    expect(result.steps).toBeInstanceOf(Array);
    expect(result.validation).toBeDefined();
  });

  it('getEntityPluginPipeline returns pipeline for account', async () => {
    const result = await service.getEntityPluginPipeline('account');
    expect(result).toBeDefined();
    expect(result.entity).toBe('account');
    expect(result.steps).toBeInstanceOf(Array);
    expect(result.executionOrder).toBeInstanceOf(Array);
  });

  it('getPluginTraceLogs returns logs', async () => {
    const result = await service.getPluginTraceLogs({
      hoursBack: 24,
      maxRecords: 5,
    });
    expect(result).toBeDefined();
    expect(typeof result.totalCount).toBe('number');
    expect(result.logs).toBeInstanceOf(Array);
  });
});
