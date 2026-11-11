import { describe, expect, it } from 'vitest';
import { FlowService } from '../services/flow-service.js';
import { SolutionService, componentTypeName } from '../services/solution-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const ORG = 'https://org.example.crm.dynamics.com';
const flows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({
  workflowid: `f${from + i}`, name: `Flow ${from + i}`, statecode: 1, ismanaged: false, modifiedon: '2026-01-01',
}));

describe('FlowService.getFlowInventory', () => {
  it('pages past 500 flows with Prefer: odata.maxpagesize instead of a $top that ends paging', async () => {
    const calls: RecordedCall[] = [];
    const service = new FlowService(fakeClient([
      ['skiptoken=2', { value: flows(1000, 200) }],
      ['skiptoken=1', { value: flows(500, 500), '@odata.nextLink': `${ORG}/api/data/v9.2/workflows?$skiptoken=2` }],
      ['workflows', { value: flows(0, 500), '@odata.nextLink': `${ORG}/api/data/v9.2/workflows?$skiptoken=1` }],
    ], calls, ORG));

    const result = await service.getFlowInventory({ maxRecords: 5000 });

    expect(result.totalCount).toBe(1200);
    expect(result).toMatchObject({ hasMore: false, requestedMax: 5000 });
    expect(calls).toHaveLength(3);
    expect(calls[0].endpoint).not.toContain('$top');
    expect(calls.every((c) => c.headers?.Prefer === 'odata.maxpagesize=500')).toBe(true);
    expect(calls[1].endpoint).toBe('api/data/v9.2/workflows?$skiptoken=1');
  });

  it('says when it stopped at maxRecords while more flows exist', async () => {
    const calls: RecordedCall[] = [];
    const service = new FlowService(fakeClient([
      ['workflows', { value: flows(0, 500), '@odata.nextLink': `${ORG}/api/data/v9.2/workflows?$skiptoken=1` }],
    ], calls, ORG));

    const result = await service.getFlowInventory({ maxRecords: 100 });
    expect(result.flows).toHaveLength(100);
    expect(result).toMatchObject({ hasMore: true, requestedMax: 100 });
    expect(calls).toHaveLength(1);
  });

  it('reports a complete inventory as complete', async () => {
    const service = new FlowService(fakeClient([['workflows', { value: flows(0, 3) }]], [], ORG));
    expect(await service.getFlowInventory()).toMatchObject({ totalCount: 3, hasMore: false, requestedMax: 500 });
  });
});

describe('solution component types', () => {
  it('labels plug-in components with their real type codes', () => {
    expect(componentTypeName(14)).toBe('EntityKey');
    expect(componentTypeName(65)).toBe('HierarchyRule');
    expect(componentTypeName(80)).toBe('ModelDrivenApp');
    expect(componentTypeName(90)).toBe('PluginType');
    expect(componentTypeName(91)).toBe('PluginAssembly');
    expect(componentTypeName(92)).toBe('SdkMessageProcessingStep');
    expect(componentTypeName(93)).toBe('SdkMessageProcessingStepImage');
    expect(componentTypeName(12345)).toBe('Type 12345');
  });

  it('getSolutionComponents adds componentTypeName to each component', async () => {
    const service = new SolutionService(fakeClient([
      ['solutioncomponents', { value: [{ componenttype: 91, objectid: 'a' }, { componenttype: 92, objectid: 'b' }] }],
      ['solutions', { value: [{ solutionid: 's1', uniquename: 'ContosoCore' }] }],
    ]));
    const result = await service.getSolutionComponents('ContosoCore');
    expect(result.value.map((c) => c.componentTypeName)).toEqual(['PluginAssembly', 'SdkMessageProcessingStep']);
  });
});
