import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createWorkflowService } from './test-helpers.js';
import type { WorkflowService } from '../services/workflow-service.js';

describe.skipIf(!hasCredentials())('WorkflowService (integration)', () => {
  let service: WorkflowService;

  beforeAll(() => {
    service = createWorkflowService();
  });

  it('getWorkflows returns classic workflows', async () => {
    const result = await service.getWorkflows(false, 5);
    expect(result).toBeDefined();
    expect(typeof result.totalCount).toBe('number');
    expect(typeof result.hasMore).toBe('boolean');
    expect(result.workflows).toBeInstanceOf(Array);
  });

  it('getWorkflowDefinition returns workflow definition in summary mode', async () => {
    const list = await service.getWorkflows(false, 1);
    if (list.workflows.length === 0) {
      console.log('No classic workflows found, skipping definition test');
      return;
    }

    const workflowId = (list.workflows[0] as any).workflowid;
    const result = await service.getWorkflowDefinition(workflowId, true);
    expect(result).toBeDefined();
    expect((result as any).workflowid).toBe(workflowId);
    expect((result as any).summary).toBeDefined();
  });
});
