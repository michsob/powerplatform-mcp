import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { truncationWarning } from '../cli/output.js';
import { capRows, fetchCapped, pages } from '../odata.js';
import { DataverseRequestError } from '../powerplatform-client.js';
import { CustomApiService } from '../services/customapi-service.js';
import { FlowService, flowHealthWarnings } from '../services/flow-service.js';
import { PluginService } from '../services/plugin-service.js';
import { SecurityRoleService } from '../services/security-role-service.js';
import { SolutionService } from '../services/solution-service.js';
import { truncationContent, truncationOf } from '../tools/truncation.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const ORG = 'https://org.example.crm.dynamics.com';
const rows = (from: number, n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, name: `row ${from + i}`, ...extra }));
const next = (token: number) => `${ORG}/api/data/v9.2/x?$skiptoken=${token}`;

describe('fetchCapped', () => {
  it('asks for one row over the cap, with a count, and says the list was cut', async () => {
    const calls: RecordedCall[] = [];
    const client = fakeClient([['customapis', { value: rows(0, 11), '@odata.count': 340 }]], calls, ORG);
    const result = await fetchCapped(client, 'api/data/v9.2/customapis?$select=name', 10);
    expect(calls[0].endpoint).toBe('api/data/v9.2/customapis?$select=name&$count=true&$top=11');
    expect(result).toMatchObject({ hasMore: true, requestedMax: 10, totalMatching: 340 });
    expect(result.rows).toHaveLength(10);
  });

  it('a list that fits is complete, and count can be turned off', async () => {
    const calls: RecordedCall[] = [];
    const client = fakeClient([['accounts', { value: rows(0, 3) }]], calls, ORG);
    expect(await fetchCapped(client, 'api/data/v9.2/accounts', 10, { count: false })).toEqual({ rows: rows(0, 3), hasMore: false, requestedMax: 10 });
    expect(calls[0].endpoint).toBe('api/data/v9.2/accounts?$top=11');
  });

  it('pages instead of using $top from 5,000 rows up, where $top cannot show a cut', async () => {
    const calls: RecordedCall[] = [];
    const client = fakeClient([
      ['skiptoken=1', { value: rows(5000, 1), '@odata.nextLink': next(2) }],
      ['x', { value: rows(0, 5000), '@odata.nextLink': next(1) }],
    ], calls, ORG);
    const result = await fetchCapped(client, 'api/data/v9.2/x', 5000);
    expect(calls[0].endpoint).toBe('api/data/v9.2/x');
    expect(result).toMatchObject({ hasMore: true, requestedMax: 5000 });
    expect(result.rows).toHaveLength(5000);
  });

  it('rejects a cap that is not a positive integer (a bad --max)', async () => {
    const client = fakeClient([], [], ORG);
    await expect(fetchCapped(client, 'api/data/v9.2/x', Number.NaN)).rejects.toThrow('maxRecords must be a positive integer');
    await expect(fetchCapped(client, 'api/data/v9.2/x', 0)).rejects.toThrow('maxRecords must be a positive integer');
  });

  it('does not report a count Dataverse stopped at 5,000 as the total', () => {
    expect(capRows({ value: rows(0, 11), '@odata.count': 5000 }, 10)).toMatchObject({ hasMore: true, requestedMax: 10 });
    expect(capRows({ value: rows(0, 11), '@odata.count': 5000 }, 10)).not.toHaveProperty('totalMatching');
  });

  it('pages() says whether another page follows', async () => {
    const client = fakeClient([['skiptoken=1', { value: rows(2, 1) }], ['x', { value: rows(0, 2), '@odata.nextLink': next(1) }]], [], ORG);
    const seen: boolean[] = [];
    for await (const page of pages(client, 'api/data/v9.2/x')) seen.push(page.more);
    expect(seen).toEqual([true, false]);
  });
});

describe('list services report their cap', () => {
  it('custom APIs carry hasMore, requestedMax and totalMatching', async () => {
    const service = new CustomApiService(fakeClient([['customapis', { value: rows(0, 3), '@odata.count': 3 }]]));
    expect(await service.getCustomApis({ maxRecords: 2 })).toMatchObject({ hasMore: true, requestedMax: 2, totalMatching: 3 });
  });

  it('all plugin steps say when they stopped at maxRecords', async () => {
    const service = new PluginService(fakeClient([
      ['sdkmessageprocessingsteps', { value: rows(0, 3, { stage: 40, mode: 0 }), '@odata.nextLink': next(1) }],
    ], [], ORG));
    const result = await service.getAllPluginSteps({ maxRecords: 3 });
    expect(result).toMatchObject({ totalCount: 3, hasMore: true, requestedMax: 3 });
  });
});

describe('reads that must see every row', () => {
  it('role privileges are read across pages, so a clone cannot drop the rest', async () => {
    const priv = (i: number) => ({ privilegeid: `p${i}`, privilegedepthmask: 8 });
    const calls: RecordedCall[] = [];
    const service = new SecurityRoleService(fakeClient([
      ['skiptoken=1', { value: [priv(2)] }],
      ['roleprivilegescollection', { value: [priv(0), priv(1)], '@odata.nextLink': `${ORG}/api/data/v9.2/roleprivilegescollection?$skiptoken=1` }],
      ['privileges', { value: [0, 1, 2].map((i) => ({ privilegeid: `p${i}`, name: `prv${i}`, accessright: 1 })) }],
    ], calls, ORG), undefined as never);

    const result = await service.getSecurityRolePrivileges('0f8fad5b-d9cb-469f-a165-70867728950e');
    expect(result.value.map((p) => p.privilegeid)).toEqual(['p0', 'p1', 'p2']);
  });

  it('publishers include read-only ones by default, and writableOnly filters them out', async () => {
    const calls: RecordedCall[] = [];
    const service = new SolutionService(fakeClient([['publishers', { value: [{ uniquename: 'isv', isreadonly: true }] }]], calls));
    expect((await service.getPublishers()).value).toEqual([{ uniquename: 'isv', isreadonly: true }]);
    expect(calls[0].endpoint).not.toContain('isreadonly eq false');
    expect(calls[0].endpoint).toContain('isreadonly');
    await service.getPublishers({ writableOnly: true });
    expect(calls[1].endpoint).toContain('$filter=isreadonly eq false');
  });
});

describe('FlowService.getFlows', () => {
  const flow = (i: number, over: Record<string, unknown> = {}) => ({
    workflowid: `f${i}`, name: `Flow ${i}`, statecode: 1, modifiedby: { fullname: 'Dev' }, ...over,
  });

  it('counts the Customer Insights flows it excludes, instead of dropping them in the query', async () => {
    const calls: RecordedCall[] = [];
    const service = new FlowService(fakeClient([['workflows', { value: [flow(1), flow(2, { name: 'CXP_Sync' }), flow(3, { modifiedby: { fullname: 'SYSTEM' } })] }]], calls));
    const result = await service.getFlows({ maxRecords: 10 });
    expect(calls[0].endpoint).not.toContain('CXP_');
    expect(calls[0].endpoint).not.toContain('$top');
    expect(result.excluded).toEqual({ customerInsights: 1, system: 1, copilotSales: 0, total: 2 });
    expect(result).toMatchObject({ totalCount: 1, hasMore: false, requestedMax: 10 });
  });

  it('reads pages until one more flow than the cap passes the filters', async () => {
    const calls: RecordedCall[] = [];
    const system = (i: number) => flow(i, { modifiedby: { fullname: 'SYSTEM' } });
    const service = new FlowService(fakeClient([
      ['skiptoken=2', { value: [flow(9)] }],
      ['skiptoken=1', { value: [system(4), flow(5), flow(6)], '@odata.nextLink': `${ORG}/api/data/v9.2/workflows?$skiptoken=2` }],
      ['workflows', { value: [system(1), system(2), flow(3)], '@odata.nextLink': `${ORG}/api/data/v9.2/workflows?$skiptoken=1` }],
    ], calls, ORG));
    const result = await service.getFlows({ maxRecords: 2 });
    expect(result.flows.map((f) => f.workflowid)).toEqual(['f3', 'f5']);
    expect(result).toMatchObject({ hasMore: true, requestedMax: 2 });
    expect(calls).toHaveLength(2); // stopped once f6 passed: no need to read page 3
  });
});

describe('flow runs and the health scan', () => {
  beforeEach(() => { process.env.POWERPLATFORM_ENVIRONMENT_ID = 'env-1'; });
  afterEach(() => { delete process.env.POWERPLATFORM_ENVIRONMENT_ID; });
  const GUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('flow runs honour a cap above 250 and report it', async () => {
    const calls: RecordedCall[] = [];
    const service = new FlowService(fakeClient([['flowruns', { value: [] }]], calls));
    const result = await service.getFlowRuns(GUID, { maxRecords: 1000 });
    expect(calls[0].endpoint).toContain('$top=1001');
    expect(calls[0].endpoint).not.toContain('$count');
    expect(result).toMatchObject({ hasMore: false, requestedMax: 1000 });
  });

  it('marks a flow whose window held more runs than the cap, and keeps scan errors apart from "no runs"', async () => {
    const F1 = '11111111-1111-1111-1111-111111111111';
    const F2 = '22222222-2222-2222-2222-222222222222';
    const service = new FlowService(fakeClient([
      ['flowruns', (endpoint: string) => {
        if (endpoint.includes(F2)) throw new DataverseRequestError('PowerPlatform API request failed: 403', 403);
        return { value: [{ flowrunid: 'r1', status: 'Succeeded' }, { flowrunid: 'r2', status: 'Failed' }, { flowrunid: 'r3', status: 'Succeeded' }] };
      }],
      ['workflows', { value: [
        { workflowid: F1, name: 'One', statecode: 1, modifiedby: { fullname: 'Dev' } },
        { workflowid: F2, name: 'Two', statecode: 1, modifiedby: { fullname: 'Dev' } },
      ] }],
    ]));
    const result = await service.scanFlowHealth({ maxRunsPerFlow: 2 });
    const one = result.allFlows.find((f) => f.flowId === F1)!;
    expect(one).toMatchObject({ totalRuns: 2, moreRunsExist: true, scanError: null });
    expect(result.summary).toMatchObject({ flowsNoRuns: 0, flowsWithScanErrors: 1, flowsWithMoreRuns: 1, moreFlowsExist: false });
    expect(flowHealthWarnings(result.summary, { runs: '--max-runs', flows: '--max-flows' })).toEqual([
      '1 flow(s) had more runs in the window than --max-runs 2; their success rates cover the latest runs only.',
      '1 flow(s) could not be scanned; see scanError on each.',
    ]);
  });

  it('explains EnvironmentAccessDenied from the Flow API', async () => {
    const service = new FlowService({
      ...fakeClient([]),
      flowApi: async () => {
        throw new DataverseRequestError('Flow API request failed: 403', 403, 'EnvironmentAccessDenied', 'Access to the environment is denied.');
      },
    } as never);
    const error: Error = await service.getFlowRunDetails(GUID, '08584').catch((e) => e);
    expect(error.message).toContain('403 EnvironmentAccessDenied');
    expect(error.message).toContain('without maker access in the environment, whatever its Dataverse security roles');
    expect(error.message).toContain('API message: Access to the environment is denied.');
  });
});

describe('how a cut list is shown', () => {
  it('the CLI prints a warning with the cap and the total', () => {
    expect(truncationWarning({ hasMore: true, requestedMax: 100, totalMatching: 340 }))
      .toBe('  ⚠ Stopped at 100 of 340 matching; more exist. Raise --max (or narrow the filter) to see the rest.');
    expect(truncationWarning({ hasMore: false, requestedMax: 100 })).toBe('');
    expect(truncationWarning([1, 2])).toBe('');
  });

  it('tools put a warning before the data and keep the fields in structuredContent', () => {
    expect(truncationContent({ hasMore: true, requestedMax: 50 })[0].text).toContain('stopped at maxRecords=50; more rows exist');
    expect(truncationContent({ hasMore: false })).toEqual([]);
    expect(truncationOf({ value: [1], hasMore: true, requestedMax: 1 } as never)).toEqual({ hasMore: true, requestedMax: 1 });
    expect(truncationOf({})).toEqual({ hasMore: false });
  });
});
