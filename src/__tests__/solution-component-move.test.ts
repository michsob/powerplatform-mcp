import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import type { EnvironmentRegistry } from '../environment-config.js';
import { SolutionService, missingDependencySummary } from '../services/solution-service.js';
import { registerSolutionTools } from '../tools/solution-tools.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const CORE = { solutionid: '11111111-1111-1111-1111-111111111111', uniquename: 'Core', ismanaged: false };
const SALES = { solutionid: '22222222-2222-2222-2222-222222222222', uniquename: 'Sales', ismanaged: false };
const VENDOR = { solutionid: '33333333-3333-3333-3333-333333333333', uniquename: 'Vendor', ismanaged: true };
const SOLUTIONS = [CORE, SALES, VENDOR];

const TABLE = 'aaaaaaaa-0000-0000-0000-000000000001';
const TABLE_ROW = 'bbbbbbbb-0000-0000-0000-000000000001';
const COLUMN = 'aaaaaaaa-0000-0000-0000-000000000002';
const COLUMN_ROW = 'bbbbbbbb-0000-0000-0000-000000000002';
const FORM = 'aaaaaaaa-0000-0000-0000-000000000003';
const FORM_ROW = 'bbbbbbbb-0000-0000-0000-000000000003';
const WEB_RESOURCE = 'aaaaaaaa-0000-0000-0000-000000000004';
const WEB_RESOURCE_ROW = 'bbbbbbbb-0000-0000-0000-000000000004';
const RELATIONSHIP = 'aaaaaaaa-0000-0000-0000-000000000005';
const RELATIONSHIP_ROW = 'bbbbbbbb-0000-0000-0000-000000000005';

interface Row {
  solutionid: string;
  solutioncomponentid: string;
  objectid: string;
  componenttype: number;
  rootcomponentbehavior: number | null;
  rootsolutioncomponentid: string | null;
}

/** Core holds a table without all its subcomponents, one of its columns and one of its forms, and a web resource. */
const coreRows = (): Row[] => [
  { solutionid: CORE.solutionid, solutioncomponentid: TABLE_ROW, objectid: TABLE, componenttype: 1, rootcomponentbehavior: 1, rootsolutioncomponentid: null },
  { solutionid: CORE.solutionid, solutioncomponentid: COLUMN_ROW, objectid: COLUMN, componenttype: 2, rootcomponentbehavior: null, rootsolutioncomponentid: TABLE_ROW },
  { solutionid: CORE.solutionid, solutioncomponentid: FORM_ROW, objectid: FORM, componenttype: 60, rootcomponentbehavior: null, rootsolutioncomponentid: TABLE_ROW },
  { solutionid: CORE.solutionid, solutioncomponentid: WEB_RESOURCE_ROW, objectid: WEB_RESOURCE, componenttype: 61, rootcomponentbehavior: null, rootsolutioncomponentid: null },
];

const filterValue = (endpoint: string, field: string): string | undefined =>
  endpoint.match(new RegExp(`\\b${field} eq ([0-9a-f-]+)`))?.[1];

/** The solutioncomponents query the service sends, answered from `rows`. */
function query(rows: Row[], endpoint: string): Row[] {
  const solutionId = filterValue(endpoint, '_solutionid_value');
  const type = filterValue(endpoint, 'componenttype');
  const id = filterValue(endpoint, 'objectid');
  const root = filterValue(endpoint, 'rootsolutioncomponentid');
  return rows.filter((r) =>
    (!solutionId || r.solutionid === solutionId) &&
    (!type || r.componenttype === Number(type)) &&
    (!id || r.objectid === id || r.solutioncomponentid === id) &&
    (!root || r.rootsolutioncomponentid === root));
}

/**
 * A Dataverse whose solution components change with AddSolutionComponent and RemoveSolutionComponent.
 * Removing a component takes the rows under it along, as Dataverse does, unless `leavesSubcomponents`;
 * `alsoRemoves` names what else a removal takes (a lookup column takes its relationship). `fail` makes
 * the POST whose endpoint and body it matches throw; `ignoreRemovals` accepts removals without making them.
 */
function environment(options: {
  rows?: Row[];
  missing?: Record<string, Record<string, unknown>[]>;
  fail?: (endpoint: string, data: any) => boolean;
  ignoreRemovals?: boolean;
  leavesSubcomponents?: boolean;
  alsoRemoves?: Record<string, string[]>;
} = {}) {
  const rows = options.rows ?? coreRows();
  const calls: RecordedCall[] = [];
  let next = 0;
  const client = fakeClient([
    ['RetrieveMissingDependencies', (e: string) => ({ value: options.missing?.[decodeURIComponent(e.split('@p1=')[1]).slice(1, -1)] ?? [] })],
    ['solutioncomponents', (e: string) => ({ value: query(rows, e) })],
    ['solutions?', (e: string) => ({ value: SOLUTIONS.filter((s) => e.includes(`uniquename eq '${s.uniquename}'`)) })],
  ], calls);
  (client as any).post = async (endpoint: string, data: any) => {
    calls.push({ method: 'POST', endpoint, data });
    if (options.fail?.(endpoint, data)) throw new Error('Dataverse said no');
    const solution = SOLUTIONS.find((s) => s.uniquename === data.SolutionUniqueName)!;
    if (endpoint.endsWith('AddSolutionComponent')) {
      rows.push({
        solutionid: solution.solutionid,
        solutioncomponentid: `cccccccc-0000-0000-0000-${String(++next).padStart(12, '0')}`,
        objectid: data.ComponentId,
        componenttype: data.ComponentType,
        rootcomponentbehavior: data.ComponentType !== 1 ? null
          : !data.DoNotIncludeSubcomponents ? 0
          : Array.isArray(data.IncludedComponentSettingsValues) && data.IncludedComponentSettingsValues.length === 0 ? 2 : 1,
        rootsolutioncomponentid: null,
      });
    } else if (endpoint.endsWith('RemoveSolutionComponent') && !options.ignoreRemovals) {
      const at = rows.findIndex((r) => r.solutionid === solution.solutionid
        && r.objectid === data.SolutionComponent.solutioncomponentid && r.componenttype === data.ComponentType);
      if (at < 0) throw new Error('Cannot find solution component');
      const [removed] = rows.splice(at, 1);
      const along = (r: Row) => r.solutionid === solution.solutionid && (
        (!options.leavesSubcomponents && r.rootsolutioncomponentid === removed.solutioncomponentid)
        || (options.alsoRemoves?.[removed.objectid] ?? []).includes(r.objectid));
      for (let i = rows.length - 1; i >= 0; i--) if (along(rows[i])) rows.splice(i, 1);
    }
  };
  const posts = () => calls.filter((c) => c.method === 'POST');
  return { service: new SolutionService(client), rows, calls, posts };
}

const inSolution = (rows: Row[], solution: { solutionid: string }) =>
  rows.filter((r) => r.solutionid === solution.solutionid).map((r) => r.objectid);

describe('SolutionService.removeSolutionComponent', () => {
  it('sends the component as a solutioncomponent entity holding its objectid', async () => {
    const env = environment();
    const result = await env.service.removeSolutionComponent('Core', WEB_RESOURCE, 61);

    expect(env.posts()).toEqual([{
      method: 'POST',
      endpoint: 'api/data/v9.2/RemoveSolutionComponent',
      data: {
        SolutionComponent: { '@odata.type': 'Microsoft.Dynamics.CRM.solutioncomponent', solutioncomponentid: WEB_RESOURCE },
        ComponentType: 61,
        SolutionUniqueName: 'Core',
      },
    }]);
    expect(result).toEqual({
      solutionUniqueName: 'Core', componentId: WEB_RESOURCE, componentType: 61, componentTypeName: 'WebResource', subcomponents: [],
    });
    expect(inSolution(env.rows, CORE)).not.toContain(WEB_RESOURCE);
  });

  it('takes the row id from get-solution-components as well, and still sends the objectid', async () => {
    const env = environment();
    const result = await env.service.removeSolutionComponent('Core', WEB_RESOURCE_ROW.toUpperCase(), 61);
    expect((env.posts()[0].data as any).SolutionComponent.solutioncomponentid).toBe(WEB_RESOURCE);
    expect(result.componentId).toBe(WEB_RESOURCE);
  });

  it('takes the subcomponents a table holds under it out of the solution with it', async () => {
    const env = environment();
    const result = await env.service.removeSolutionComponent('Core', TABLE, 1);

    expect(env.posts().map((c) => (c.data as any).SolutionComponent.solutioncomponentid)).toEqual([TABLE]);
    expect(result.subcomponents.map((s) => s.componentTypeName)).toEqual(['Attribute', 'SystemForm']);
    expect(inSolution(env.rows, CORE)).toEqual([WEB_RESOURCE]);
  });

  it('removes the subcomponents Dataverse leaves, skipping one an earlier removal took along', async () => {
    const rows = coreRows();
    rows.splice(2, 0, { solutionid: CORE.solutionid, solutioncomponentid: RELATIONSHIP_ROW, objectid: RELATIONSHIP, componenttype: 10, rootcomponentbehavior: null, rootsolutioncomponentid: TABLE_ROW });
    const env = environment({ rows, leavesSubcomponents: true, alsoRemoves: { [COLUMN]: [RELATIONSHIP] } });
    const result = await env.service.removeSolutionComponent('Core', TABLE, 1);

    expect(env.posts().map((c) => (c.data as any).SolutionComponent.solutioncomponentid)).toEqual([TABLE, COLUMN, FORM]);
    expect(result.subcomponents.map((s) => s.componentId)).toEqual([COLUMN, RELATIONSHIP, FORM]);
    expect(inSolution(env.rows, CORE)).toEqual([WEB_RESOURCE]);
  });

  it('refuses a managed solution before writing anything', async () => {
    const env = environment();
    await expect(env.service.removeSolutionComponent('Vendor', WEB_RESOURCE, 61)).rejects.toThrow(/'Vendor' is managed/);
    expect(env.posts()).toHaveLength(0);
  });

  it('refuses a component the solution does not hold, and an unknown solution', async () => {
    const env = environment();
    await expect(env.service.removeSolutionComponent('Sales', WEB_RESOURCE, 61))
      .rejects.toThrow(`WebResource ${WEB_RESOURCE} is not in solution 'Sales'`);
    await expect(env.service.removeSolutionComponent('Core', WEB_RESOURCE, 1)).rejects.toThrow(/not in solution 'Core'/);
    await expect(env.service.removeSolutionComponent('Nope', WEB_RESOURCE, 61)).rejects.toThrow("Solution 'Nope' not found");
    expect(env.posts()).toHaveLength(0);
  });

  it('refuses an id that is not a GUID before any request', async () => {
    const env = environment();
    await expect(env.service.removeSolutionComponent('Core', "x' or 1 eq 1", 61)).rejects.toThrow(/componentId must be a GUID/);
    expect(env.posts()).toHaveLength(0);
  });

  it('does not report a removal Dataverse accepted but did not make', async () => {
    const env = environment({ ignoreRemovals: true });
    await expect(env.service.removeSolutionComponent('Core', WEB_RESOURCE, 61))
      .rejects.toThrow(/accepted the removal, but WebResource .* is still in solution 'Core'/);
  });

  it('says how far it got when a removal fails', async () => {
    const env = environment({ leavesSubcomponents: true, fail: (_e, data) => data.SolutionComponent?.solutioncomponentid === FORM });
    await expect(env.service.removeSolutionComponent('Core', TABLE, 1))
      .rejects.toThrow(/Removing Entity .* from 'Core' stopped: Dataverse said no\. Done before it: removed it from 'Core'; removed a subcomponent it left in 'Core'\./);
  });
});

describe('SolutionService.moveSolutionComponent', () => {
  it('adds the table to the target as the source holds it, then removes it from the source', async () => {
    const env = environment({
      missing: {
        Core: [{ requiredcomponentobjectid: TABLE, requiredcomponenttype: 1, dependentcomponentobjectid: WEB_RESOURCE, dependentcomponenttype: 61, dependencytype: 2 }],
      },
    });
    const result = await env.service.moveSolutionComponent('Core', 'Sales', TABLE, 1);

    const steps = env.posts().map((c) => {
      const data = c.data as any;
      return `${c.endpoint.split('/').pop()} ${data.SolutionUniqueName} ${data.ComponentId ?? data.SolutionComponent.solutioncomponentid}`;
    });
    expect(steps).toEqual([
      `AddSolutionComponent Sales ${TABLE}`,
      `AddSolutionComponent Sales ${COLUMN}`,
      `AddSolutionComponent Sales ${FORM}`,
      `RemoveSolutionComponent Core ${TABLE}`,
    ]);
    // The source held the table without all its subcomponents, so the target does too.
    expect(env.posts()[0].data).toEqual({
      ComponentId: TABLE, ComponentType: 1, SolutionUniqueName: 'Sales', AddRequiredComponents: false, DoNotIncludeSubcomponents: true,
    });
    expect(inSolution(env.rows, CORE)).toEqual([WEB_RESOURCE]);
    expect(inSolution(env.rows, SALES)).toEqual([TABLE, COLUMN, FORM]);

    expect(result).toMatchObject({
      sourceSolutionUniqueName: 'Core',
      targetSolutionUniqueName: 'Sales',
      componentId: TABLE,
      componentTypeName: 'Entity',
      rootComponentBehavior: { source: 1, target: 1 },
    });
    expect(result.subcomponents.map((s) => s.componentId)).toEqual([COLUMN, FORM]);
    expect(result.missingDependencies.target).toEqual([]);
    expect(result.missingDependencies.source).toEqual([expect.objectContaining({
      requiredcomponentobjectid: TABLE,
      requiredComponentTypeName: 'Entity',
      dependentComponentTypeName: 'WebResource',
      dependencyTypeName: 'Published',
    })]);
  });

  it('keeps a shell a shell', async () => {
    const rows = coreRows().map((r) => (r.componenttype === 1 ? { ...r, rootcomponentbehavior: 2 } : r));
    const env = environment({ rows });
    const result = await env.service.moveSolutionComponent('Core', 'Sales', TABLE, 1);

    expect(env.posts()[0].data).toEqual({
      ComponentId: TABLE, ComponentType: 1, SolutionUniqueName: 'Sales', AddRequiredComponents: false,
      DoNotIncludeSubcomponents: true, IncludedComponentSettingsValues: [],
    });
    expect(result.rootComponentBehavior).toEqual({ source: 2, target: 2 });
    expect(result.subcomponents.map((s) => s.componentId)).toEqual([COLUMN, FORM]);
  });

  it('adds a whole table as a whole table, with its required components when asked', async () => {
    const rows = coreRows().filter((r) => r.componenttype === 1).map((r) => ({ ...r, rootcomponentbehavior: 0 }));
    const env = environment({ rows });
    await env.service.moveSolutionComponent('Core', 'Sales', TABLE, 1, { addRequiredComponents: true });
    expect(env.posts()[0].data).toEqual({ ComponentId: TABLE, ComponentType: 1, SolutionUniqueName: 'Sales', AddRequiredComponents: true });
  });

  it('leaves the component in both solutions when the removal fails, and says so', async () => {
    const env = environment({ fail: (e) => e.endsWith('RemoveSolutionComponent') });
    await expect(env.service.moveSolutionComponent('Core', 'Sales', WEB_RESOURCE, 61))
      .rejects.toThrow(/Moving WebResource .* from 'Core' to 'Sales' stopped: Dataverse said no\. Done before it: added it to 'Sales'\./);
    expect(inSolution(env.rows, CORE)).toContain(WEB_RESOURCE);
    expect(inSolution(env.rows, SALES)).toContain(WEB_RESOURCE);
  });

  it('removes nothing from the source when the add fails', async () => {
    const env = environment({ fail: (e) => e.endsWith('AddSolutionComponent') });
    await expect(env.service.moveSolutionComponent('Core', 'Sales', WEB_RESOURCE, 61))
      .rejects.toThrow(/stopped: Dataverse said no\. Nothing was changed before it\./);
    expect(env.posts().filter((c) => c.endpoint.endsWith('RemoveSolutionComponent'))).toHaveLength(0);
    expect(inSolution(env.rows, CORE)).toContain(WEB_RESOURCE);
  });

  it('refuses the same solution twice and a managed target before writing anything', async () => {
    const env = environment();
    await expect(env.service.moveSolutionComponent('Core', 'Core', WEB_RESOURCE, 61)).rejects.toThrow(/same solution/);
    await expect(env.service.moveSolutionComponent('Core', 'Vendor', WEB_RESOURCE, 61)).rejects.toThrow(/'Vendor' is managed/);
    expect(env.posts()).toHaveLength(0);
  });
});

describe('SolutionService.getMissingDependencies', () => {
  it('calls RetrieveMissingDependencies as a function with the name as an escaped alias', async () => {
    const calls: RecordedCall[] = [];
    const service = new SolutionService(fakeClient([
      ['RetrieveMissingDependencies', { value: [{ requiredcomponentobjectid: TABLE, requiredcomponenttype: 1, dependentcomponentobjectid: COLUMN, dependentcomponenttype: 2, dependencytype: 1 }] }],
      ['solutions?', { value: [{ solutionid: CORE.solutionid, uniquename: "O'Brien & Co" }] }],
    ], calls));

    const result = await service.getMissingDependencies("O'Brien & Co");
    expect(calls[1].endpoint).toBe("api/data/v9.2/RetrieveMissingDependencies(SolutionUniqueName=@p1)?@p1='O''Brien%20%26%20Co'");
    expect(calls[1].method).toBeUndefined();
    expect(result.missingDependencies[0]).toMatchObject({
      requiredComponentTypeName: 'Entity', dependentComponentTypeName: 'Attribute', dependencyTypeName: 'SolutionInternal',
    });
  });

  it('refuses a solution that does not exist instead of reporting nothing missing', async () => {
    const calls: RecordedCall[] = [];
    const service = new SolutionService(fakeClient([['solutions?', { value: [] }]], calls));
    await expect(service.getMissingDependencies('Nope')).rejects.toThrow("Solution 'Nope' not found");
    expect(calls.some((c) => c.endpoint.includes('RetrieveMissingDependencies'))).toBe(false);
  });

  it('says so when Dataverse reports a table as needing itself', () => {
    const lines = missingDependencySummary('Core', [{
      requiredcomponentobjectid: TABLE, requiredcomponenttype: 1, requiredComponentTypeName: 'Entity',
      dependentcomponentobjectid: TABLE, dependentcomponenttype: 1, dependentComponentTypeName: 'Entity',
      dependencyTypeName: 'SolutionInternal',
    }]);
    expect(lines[1]).toBe(`    Entity ${TABLE}, required by itself (SolutionInternal): the solution holds it without all its subcomponents`);
  });

  it('summarises what is missing, and an all-clear', () => {
    expect(missingDependencySummary('Core', [])).toEqual(["✓ 'Core': no missing dependencies"]);
    const missing = Array.from({ length: 12 }, () => ({
      requiredcomponentobjectid: TABLE, requiredComponentTypeName: 'Entity',
      dependentcomponentobjectid: COLUMN, dependentComponentTypeName: 'Attribute', dependencyTypeName: 'Published',
    }));
    const lines = missingDependencySummary('Core', missing);
    expect(lines[0]).toBe("✗ 'Core': 12 missing dependencies:");
    expect(lines[1]).toBe(`    Entity ${TABLE}, required by Attribute ${COLUMN}`);
    expect(lines).toHaveLength(12);
    expect(lines[11]).toBe('    ... and 2 more');
  });
});

describe('SolutionService.addSolutionComponent', () => {
  const base = { ComponentId: TABLE, ComponentType: 1, SolutionUniqueName: 'Core', AddRequiredComponents: false };

  it('adds a table all of it, its metadata, or a shell, as asked', async () => {
    const calls: RecordedCall[] = [];
    const service = new SolutionService(fakeClient([], calls));
    await service.addSolutionComponent('Core', TABLE, 1, false);
    await service.addSolutionComponent('Core', TABLE, 1, false, { include: 'all' });
    await service.addSolutionComponent('Core', TABLE, 1, false, { include: 'metadata' });
    await service.addSolutionComponent('Core', TABLE, 1, false, { include: 'shell' });

    expect(calls.map((c) => c.data)).toEqual([
      base,
      base,
      { ...base, DoNotIncludeSubcomponents: true },
      { ...base, DoNotIncludeSubcomponents: true, IncludedComponentSettingsValues: [] },
    ]);
  });

  it('refuses include for anything but a table, and an unknown include, before any request', async () => {
    const calls: RecordedCall[] = [];
    const service = new SolutionService(fakeClient([], calls));
    await expect(service.addSolutionComponent('Core', COLUMN, 2, false, { include: 'shell' }))
      .rejects.toThrow('include applies to a table (component type 1), not to Attribute');
    await expect(service.addSolutionComponent('Core', TABLE, 1, false, { include: 'some' as never }))
      .rejects.toThrow("include must be all, metadata or shell, not 'some'");
    expect(calls).toHaveLength(0);
  });

  it('reads back how a solution holds a table', async () => {
    const env = environment();
    expect(await env.service.getTableInclude('Core', TABLE)).toBe(1);
    expect(await env.service.getTableInclude('Sales', TABLE)).toBeNull();
    await expect(env.service.getTableInclude('Nope', TABLE)).rejects.toThrow("Solution 'Nope' not found");
  });
});

describe('add-solution-component (MCP)', () => {
  async function tool(env: ReturnType<typeof environment>) {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerSolutionTools(server, { getContext: () => ({ getSolutionService: () => env.service }) } as unknown as EnvironmentRegistry);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return (args: Record<string, unknown>) => client.callTool({ name: 'add-solution-component', arguments: args });
  }
  const text = (result: Awaited<ReturnType<Client['callTool']>>) => (result.content as { text: string }[])[0].text;

  it('says how the solution now holds the table', async () => {
    const env = environment();
    const call = await tool(env);

    const result = await call({ solutionUniqueName: 'Sales', componentId: TABLE, componentType: 1, include: 'shell' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ rootComponentBehavior: 2 });
    expect(text(result)).toBe(`Added table ${TABLE} to solution 'Sales': the solution holds it as a shell, holding only the columns, forms and views added one by one.`);
  });

  it('says so when the solution already held more of the table than asked', async () => {
    const rows = coreRows().map((r) => (r.componenttype === 1 ? { ...r, rootcomponentbehavior: 0 } : r));
    const env = environment({ rows });
    // Like Dataverse: a table the solution holds is only ever widened.
    const post = (env.service as any).client.post;
    (env.service as any).client.post = async (endpoint: string, data: any) => {
      if (endpoint.endsWith('AddSolutionComponent') && rows.some((r) => r.objectid === data.ComponentId && r.solutionid === CORE.solutionid)) return;
      return post(endpoint, data);
    };
    const call = await tool(env);

    const result = await call({ solutionUniqueName: 'Core', componentId: TABLE, componentType: 1, include: 'metadata' });

    expect(text(result)).toMatch(/holds it with all its columns, forms and views\. That is not 'metadata': .* remove the table from the solution first and add it again\.$/);
  });

  it('returns a refused include as an error', async () => {
    const call = await tool(environment());
    const result = await call({ solutionUniqueName: 'Core', componentId: COLUMN, componentType: 2, include: 'metadata' });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('Failed to add solution component: include applies to a table (component type 1), not to Attribute');
  });
});
