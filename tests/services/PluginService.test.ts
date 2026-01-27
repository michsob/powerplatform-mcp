/**
 * Integration tests for PluginService
 * Tests against a real Dataverse environment
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { PluginService } from '../../src/services/PluginService.js';
import { getTestClient } from '../__helpers__/testClient.js';

describe('PluginService', () => {
  let service: PluginService;

  beforeAll(() => {
    service = new PluginService(getTestClient());
  });

  describe('getPluginAssemblies', () => {
    it('should fetch plugin assemblies', async () => {
      const result = await service.getPluginAssemblies();

      expect(result).toBeDefined();
      expect(typeof result.totalCount).toBe('number');
      expect(Array.isArray(result.assemblies)).toBe(true);
    });

    it('should return assemblies with expected properties', async () => {
      const result = await service.getPluginAssemblies(true); // Include managed

      if (result.assemblies.length > 0) {
        const assembly = result.assemblies[0] as any;
        expect(assembly.pluginassemblyid).toBeDefined();
        expect(assembly.name).toBeDefined();
        expect(assembly.isolationMode).toBeDefined();
      }
    });

    it('should filter out hidden assemblies', async () => {
      const result = await service.getPluginAssemblies(true);

      // All returned assemblies should not be hidden
      for (const assembly of result.assemblies as any[]) {
        const isHidden = typeof assembly.ishidden === 'object'
          ? assembly.ishidden?.Value
          : assembly.ishidden;
        expect(isHidden).not.toBe(true);
      }
    });

    it('should map isolation mode correctly', async () => {
      const result = await service.getPluginAssemblies(true);

      for (const assembly of result.assemblies as any[]) {
        // Isolation mode should be mapped to a string
        expect(['None', 'Sandbox', 'External']).toContain(assembly.isolationMode);
      }
    });

    it('should filter unmanaged by default', async () => {
      const unmanagedResult = await service.getPluginAssemblies(false);
      const allResult = await service.getPluginAssemblies(true);

      // Unmanaged only should be <= all assemblies
      expect(unmanagedResult.totalCount).toBeLessThanOrEqual(allResult.totalCount);
    });
  });

  describe('getPluginAssemblyComplete', () => {
    it('should throw error when assembly not found', async () => {
      await expect(service.getPluginAssemblyComplete('NonExistentPluginAssembly_12345'))
        .rejects.toThrow("Plugin assembly 'NonExistentPluginAssembly_12345' not found");
    });

    it('should fetch complete assembly data for an existing assembly', async () => {
      // First get the list of assemblies
      const assemblies = await service.getPluginAssemblies(true);

      if (assemblies.totalCount === 0) {
        // Skip if no assemblies exist in the environment
        console.log('No plugin assemblies found in environment, skipping test');
        return;
      }

      const assemblyName = (assemblies.assemblies[0] as any).name;
      const result = await service.getPluginAssemblyComplete(assemblyName);

      expect(result).toBeDefined();
      expect(result.assembly).toBeDefined();
      expect(Array.isArray(result.pluginTypes)).toBe(true);
      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.validation).toBeDefined();
    });
  });

  describe('getEntityPluginPipeline', () => {
    it('should fetch plugin pipeline for account entity', async () => {
      const result = await service.getEntityPluginPipeline('account');

      expect(result).toBeDefined();
      expect(result.entity).toBe('account');
      expect(typeof result.steps.length).toBe('number');
      expect(result.messages).toBeDefined();
    });

    it('should include messages in the pipeline', async () => {
      const result = await service.getEntityPluginPipeline('account');

      // The messages array contains distinct messages
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
    });

    it('should filter by message name when provided', async () => {
      const result = await service.getEntityPluginPipeline('account', 'Create');

      expect(result).toBeDefined();
      expect(result.entity).toBe('account');

      // All steps should be for Create message if any exist
      expect(Array.isArray(result.steps)).toBe(true);
    });
  });

  describe('getPluginTraceLogs', () => {
    it('should fetch trace logs with default options', async () => {
      const result = await service.getPluginTraceLogs({});

      expect(result).toBeDefined();
      expect(typeof result.totalCount).toBe('number');
      expect(Array.isArray(result.logs)).toBe(true);
    });

    it('should return logs with expected properties when logs exist', async () => {
      const result = await service.getPluginTraceLogs({ maxRecords: 5 });

      if (result.logs.length > 0) {
        const log = result.logs[0] as any;
        expect(log.operationTypeName).toBeDefined();
        expect(log.modeName).toBeDefined();
        expect(log.parsed).toBeDefined();
      }
    });

    it('should map operation type names correctly', async () => {
      const result = await service.getPluginTraceLogs({});

      for (const log of result.logs as any[]) {
        expect([
          'None', 'Create', 'Update', 'Delete',
          'Retrieve', 'RetrieveMultiple', 'Associate',
          'Disassociate', 'Unknown'
        ]).toContain(log.operationTypeName);
      }
    });

    it('should parse exception details when present', async () => {
      const result = await service.getPluginTraceLogs({ exceptionOnly: true });

      for (const log of result.logs as any[]) {
        if (log.exceptiondetails) {
          expect(log.parsed.hasException).toBe(true);
        }
      }
    });

    it('should apply entity filter', async () => {
      const result = await service.getPluginTraceLogs({ entityName: 'account' });

      for (const log of result.logs as any[]) {
        expect(log.primaryentity).toBe('account');
      }
    });

    it('should apply message filter', async () => {
      const result = await service.getPluginTraceLogs({ messageName: 'Create' });

      for (const log of result.logs as any[]) {
        expect(log.messagename).toBe('Create');
      }
    });
  });
});
