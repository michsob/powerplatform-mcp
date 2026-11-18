import { describe, expect, it } from 'vitest';
import { PluginService, stageName } from '../services/plugin-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const step = (over: Record<string, unknown>) => ({
  sdkmessageprocessingstepid: 's', name: 'step', stage: 40, mode: 0, rank: 1, statuscode: 1,
  filteringattributes: null, sdkmessageid: { name: 'Update' }, _plugintypeid_value: 't1', ...over,
});

describe('stageName', () => {
  it('names every pipeline stage, including the main operation a Custom API runs in', () => {
    expect([10, 20, 30, 40].map(stageName)).toEqual(['PreValidation', 'PreOperation', 'MainOperation', 'PostOperation']);
    expect(stageName(99)).toBe('Unknown(99)');
  });
});

describe('getPluginAssemblyComplete validation', () => {
  const service = (steps: unknown[]) => new PluginService(fakeClient([
    ['pluginassemblies', { value: [{ pluginassemblyid: 'a1', name: 'Contoso.Plugins' }] }],
    ['plugintypes', { value: [{ plugintypeid: 't1', typename: 'Contoso.Plugins.AccountPlugin' }] }],
    ['sdkmessageprocessingstepimages', { value: [] }],
    ['sdkmessageprocessingsteps', { value: steps }],
  ]));

  it('flags missing filtering attributes on Update steps only — they do not apply to Delete', async () => {
    const result = await service([
      step({ sdkmessageprocessingstepid: 's1', name: 'update-no-filter' }),
      step({ sdkmessageprocessingstepid: 's2', name: 'update-filtered', filteringattributes: 'name' }),
      step({ sdkmessageprocessingstepid: 's3', name: 'delete-step', sdkmessageid: { name: 'Delete' } }),
    ]).getPluginAssemblyComplete('Contoso.Plugins');

    expect(result.validation.stepsWithoutFilteringAttributes).toEqual(['update-no-filter']);
    expect(result.validation.potentialIssues).toContain('1 Update steps without filtering attributes (performance concern)');
    // Images still matter on Delete: the pre-image is the only copy of the deleted row.
    expect(result.validation.stepsWithoutImages).toEqual(['update-no-filter', 'update-filtered', 'delete-step']);
  });
});

describe('getEntityPluginPipeline', () => {
  it('groups a stage-30 step under mainOperation instead of dropping it', async () => {
    const service = new PluginService(fakeClient([
      ['sdkmessageprocessingstepimages', { value: [] }],
      ['sdkmessageprocessingsteps', { value: [
        step({ sdkmessageprocessingstepid: 's1', name: 'pre', stage: 20, sdkmessageid: { name: 'contoso_DoWork' } }),
        step({ sdkmessageprocessingstepid: 's2', name: 'main', stage: 30, sdkmessageid: { name: 'contoso_DoWork' } }),
      ] }],
      ['plugintypes(t1)', { pluginassemblyid: { name: 'Contoso.Plugins', version: '1.0.0.0' } }],
    ]));

    const result = await service.getEntityPluginPipeline('account');
    const stages = (result.messages[0] as { stages: Record<string, { name: string }[]> }).stages;
    expect(stages.preOperation.map((s) => s.name)).toEqual(['pre']);
    expect(stages.mainOperation.map((s) => s.name)).toEqual(['main']);
    expect((result.steps as { stageName: string }[]).map((s) => s.stageName)).toEqual(['PreOperation', 'MainOperation']);
  });
});

describe('getPluginTraceLogs', () => {
  it('exceptionOnly excludes empty exception details — Dataverse stores "" when there is no exception', async () => {
    const calls: RecordedCall[] = [];
    const service = new PluginService(fakeClient([['plugintracelogs', { value: [] }]], calls));
    await service.getPluginTraceLogs({ exceptionOnly: true });
    expect(calls[0].endpoint).toContain("exceptiondetails ne null and exceptiondetails ne ''");
  });

  it('names operationtype as the kind of code that wrote the trace, not as an SDK message', async () => {
    const service = new PluginService(fakeClient([['plugintracelogs', { value: [
      { plugintracelogid: 'l1', operationtype: 1, messagename: 'Update', mode: 0, exceptiondetails: '' },
      { plugintracelogid: 'l2', operationtype: 2, messagename: 'Create', mode: 1, exceptiondetails: '' },
    ] }]]));
    const { logs } = await service.getPluginTraceLogs({});
    expect((logs as { operationTypeName: string; messagename: string }[]).map((l) => [l.operationTypeName, l.messagename]))
      .toEqual([['Plug-in', 'Update'], ['Workflow Activity', 'Create']]);
  });
});

describe('getPluginAssemblies', () => {
  it('excludes hidden assemblies in the query, so the cap counts only rows that are returned', async () => {
    const calls: RecordedCall[] = [];
    const service = new PluginService(fakeClient([['pluginassemblies', { value: [] }]], calls));
    await service.getPluginAssemblies(false, 25);
    expect(calls[0].endpoint).toContain('$filter=ishidden/Value eq false and ismanaged eq false');
    // One row over the cap, so a further row shows the list was cut.
    expect(calls[0].endpoint).toContain('$count=true&$top=26');

    await service.getPluginAssemblies(true, 25);
    expect(calls[1].endpoint).toContain('$filter=ishidden/Value eq false&');
  });
});

describe('PluginService.createPluginStep', () => {
  const MESSAGE = '20bebb1b-ea3e-db11-86a7-000a3a5473e8';
  const TYPE = '3e55d14d-38e3-f111-84ea-70a8a54b020b';
  const FILTER = 'b2bee193-f0dc-f111-84ea-7c1e5266250d';
  const service = (calls: RecordedCall[], message = 'Update', filters: unknown[] = [{ sdkmessagefilterid: FILTER }]) => new PluginService(fakeClient([
    [`sdkmessages(${MESSAGE})`, { name: message }],
    ['sdkmessagefilters?', { value: filters }],
  ], calls));
  const base = { name: 'Contoso: Update of contoso_type', pluginTypeId: TYPE, sdkMessageId: MESSAGE, stage: 40, mode: 0 };
  const posted = (calls: RecordedCall[]) => calls.find((c) => c.method === 'POST') as RecordedCall;

  it('stores the filtering attributes lower case, once each, and looks up the table\'s filter', async () => {
    const calls: RecordedCall[] = [];

    const result = await service(calls).createPluginStep({
      ...base, entityName: 'contoso_type', filteringAttributes: ['contoso_Points', ' statecode ', 'contoso_points', ''], solutionName: 'ContosoCore',
    });

    expect(result).toMatchObject({ sdkMessageFilterId: FILTER, filteringAttributes: 'contoso_points,statecode' });
    expect(calls.find((c) => c.endpoint.startsWith('api/data/v9.2/sdkmessagefilters?'))?.endpoint)
      .toBe(`api/data/v9.2/sdkmessagefilters?$filter=_sdkmessageid_value eq ${MESSAGE} and primaryobjecttypecode eq 'contoso_type'&$select=sdkmessagefilterid&$top=1`);
    expect(posted(calls).data).toMatchObject({
      filteringattributes: 'contoso_points,statecode',
      'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${FILTER})`,
      'sdkmessageid@odata.bind': `/sdkmessages(${MESSAGE})`,
    });
    expect(posted(calls).headers).toEqual({ 'MSCRM.SolutionUniqueName': 'ContosoCore' });
  });

  it('refuses filtering attributes on another message, and writes nothing', async () => {
    const calls: RecordedCall[] = [];

    await expect(service(calls, 'Create').createPluginStep({ ...base, filteringAttributes: ['contoso_points'] }))
      .rejects.toThrow('Filtering attributes apply to Update steps only; this step is on Create.');
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });

  it('refuses a table the message has no filter for, and both a table and a filter id', async () => {
    await expect(service([], 'Update', []).createPluginStep({ ...base, entityName: 'contoso_type' }))
      .rejects.toThrow("has no filter for 'contoso_type'");
    await expect(service([]).createPluginStep({ ...base, entityName: 'contoso_type', sdkMessageFilterId: FILTER }))
      .rejects.toThrow(/either as an entity name or as a message filter id/);
  });

  it('without the new options, posts what it always did', async () => {
    const calls: RecordedCall[] = [];

    await service(calls).createPluginStep({ ...base, sdkMessageFilterId: FILTER });

    expect(calls.filter((c) => !c.method)).toHaveLength(0);
    expect(posted(calls).data).not.toHaveProperty('filteringattributes');
    expect(posted(calls).data).toMatchObject({ 'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${FILTER})` });
  });
});
