import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createFlowService } from './test-helpers.js';
import type { FlowService } from '../services/flow-service.js';

describe.skipIf(!hasCredentials())('FlowService (integration)', () => {
  let service: FlowService;

  beforeAll(() => {
    service = createFlowService();
  });

  it('getFlows returns flows', async () => {
    const result = await service.getFlows({ maxRecords: 5 });
    expect(result).toBeDefined();
    expect(typeof result.totalCount).toBe('number');
    expect(typeof result.hasMore).toBe('boolean');
    expect(result.flows).toBeInstanceOf(Array);
    expect(result.excluded).toBeDefined();
    expect(result.filterApplied).toBeDefined();
  });

  it('searchWorkflows returns workflow results', async () => {
    const result = await service.searchWorkflows({ maxResults: 5 });
    expect(result).toBeDefined();
    expect(typeof result.totalCount).toBe('number');
    expect(typeof result.hasMore).toBe('boolean');
    expect(result.workflows).toBeInstanceOf(Array);
  });

  it('getFlowDefinition returns flow definition in summary mode', async () => {
    const list = await service.getFlows({ maxRecords: 1 });
    if (list.flows.length === 0) {
      console.log('No flows found, skipping definition test');
      return;
    }

    const flowId = list.flows[0].workflowid;
    const result = await service.getFlowDefinition(flowId, true);
    expect(result).toBeDefined();
    expect((result as any).workflowid).toBe(flowId);
    expect((result as any).summary).toBeDefined();
  });

  it('getFlowRuns returns run history', async () => {
    const list = await service.getFlows({ maxRecords: 1 });
    if (list.flows.length === 0) {
      console.log('No flows found, skipping runs test');
      return;
    }

    const flowId = list.flows[0].workflowid;
    const result = await service.getFlowRuns(flowId, { maxRecords: 5 });
    expect(result).toBeDefined();
    expect(result.flowId).toBe(flowId);
    expect(typeof result.totalCount).toBe('number');
    expect(result.runs).toBeInstanceOf(Array);
  });

  it('getFlowRunDetails returns run details', async () => {
    const list = await service.getFlows({ maxRecords: 1 });
    if (list.flows.length === 0) {
      console.log('No flows found, skipping run detail test');
      return;
    }

    const flowId = list.flows[0].workflowid;
    const runs = await service.getFlowRuns(flowId, { maxRecords: 1 });
    if (runs.runs.length === 0) {
      console.log('No flow runs found, skipping run detail test');
      return;
    }

    const runId = runs.runs[0].runId;
    const result = await service.getFlowRunDetails(flowId, runId);
    expect(result).toBeDefined();
    expect((result as any).flowId).toBe(flowId);
    expect((result as any).actionsSummary).toBeDefined();
  });
});
