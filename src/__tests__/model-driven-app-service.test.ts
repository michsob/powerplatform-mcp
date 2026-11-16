import { describe, it, expect } from 'vitest';
import { ModelDrivenAppService, buildSiteMapXml, DEFAULT_APP_ICON_ID } from '../services/model-driven-app-service.js';
import { addPages, parseGroupArg, parsePageArg, warningLines } from '../cli/commands/model-driven-app-commands.js';
import { fakeClient, type Answer, type RecordedCall } from './fake-client.js';

const APP_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const APP_UNIQUE = 'aaaaaaaa-0000-0000-0000-0000000000ff';
const SITEMAP_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const VISIT = 'cccccccc-0000-0000-0000-000000000001';
const CONTACT = 'cccccccc-0000-0000-0000-000000000002';

const app = { appmoduleid: APP_ID, appmoduleidunique: APP_UNIQUE, uniquename: 'contoso_Visits', name: 'Visits' };
const groups = [{ title: 'Visits', tables: ['contoso_visit'] }, { title: 'People', tables: ['contact'] }];
const xml = buildSiteMapXml('contoso_Visits', 'Visits', groups, 1033);

interface State { apps: unknown[]; siteMaps: unknown[]; components?: unknown[]; issues?: unknown[]; tables?: Record<string, string | undefined> }

/** Routes over a state that a create changes: the second read of the app or site map sees the row created. */
function routes(state: State): [string, Answer][] {
  const tables = state.tables ?? { contoso_visit: VISIT, contact: CONTACT };
  return [
    ...Object.entries(tables).map(([name, id]): [string, Answer] =>
      [`EntityDefinitions(LogicalName='${name}')`, id ? { MetadataId: id, PrimaryIdAttribute: `${name}id` } : {}]),
    ['organizations?', { value: [{ languagecode: 1033 }] }],
    ['appmodulecomponents?', () => ({ value: state.components ?? [] })],
    // A created app or site map stays unpublished until PublishXml, so only RetrieveUnpublishedMultiple sees it.
    ['appmodules/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?', () => ({ value: state.apps })],
    ['appmodules?', { value: [] }],
    ['sitemaps/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?', () => ({ value: state.siteMaps })],
    ['sitemaps?', { value: [] }],
    ['ValidateApp(', () => ({ AppValidationResponse: { ValidationSuccess: !(state.issues ?? []).length, ValidationIssueList: state.issues ?? [] } })],
  ];
}

/** A fake client whose POSTs of an app or a site map make the next read find it. */
function service(state: State, calls: RecordedCall[]) {
  const client = fakeClient(routes(state), calls);
  const post = client.post.bind(client);
  (client as unknown as { post: typeof client.post }).post = (async (endpoint: string, data?: unknown, headers?: Record<string, string>) => {
    await post(endpoint, data, headers);
    if (endpoint === 'api/data/v9.2/appmodules') state.apps = [app];
    if (endpoint === 'api/data/v9.2/sitemaps') state.siteMaps = [{ sitemapid: SITEMAP_ID, sitemapnameunique: 'contoso_Visits', sitemapxml: (data as { sitemapxml: string }).sitemapxml }];
  }) as typeof client.post;
  return new ModelDrivenAppService(client);
}

const writes = (calls: RecordedCall[]) => calls.filter((c) => c.method);

describe('ModelDrivenAppService.ensureApp', () => {
  it('creates the app and its site map in the solution, adds the tables and the site map, validates and publishes', async () => {
    const calls: RecordedCall[] = [];
    const result = await service({ apps: [], siteMaps: [] }, calls)
      .ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits', groups, solutionUniqueName: 'ContosoCore' });

    expect(result).toMatchObject({
      appModuleId: APP_ID, created: true, siteMapChanged: true, tablesAdded: ['contoso_visit', 'contact'], tables: ['contoso_visit', 'contact'],
      warnings: [], published: true, url: `https://org.example.crm.dynamics.com/main.aspx?appid=${APP_ID}`,
    });
    const solution = { 'MSCRM.SolutionUniqueName': 'ContosoCore' };
    expect(writes(calls)).toEqual([
      { method: 'POST', endpoint: 'api/data/v9.2/appmodules', headers: solution,
        data: { name: 'Visits', uniquename: 'contoso_Visits', webresourceid: DEFAULT_APP_ICON_ID, clienttype: 4 } },
      { method: 'POST', endpoint: 'api/data/v9.2/sitemaps', headers: solution,
        data: { sitemapname: 'Visits', sitemapnameunique: 'contoso_Visits', sitemapxml: xml, isappaware: true } },
      { method: 'POST', endpoint: 'api/data/v9.2/AddAppComponents', headers: undefined, data: { AppId: APP_ID, Components: [
        { '@odata.type': 'Microsoft.Dynamics.CRM.contoso_visit', contoso_visitid: VISIT },
        { '@odata.type': 'Microsoft.Dynamics.CRM.contact', contactid: CONTACT },
        { '@odata.type': 'Microsoft.Dynamics.CRM.sitemap', sitemapid: SITEMAP_ID },
      ] } },
      { method: 'POST', endpoint: 'api/data/v9.2/PublishXml', headers: undefined, data: { ParameterXml:
        `<importexportxml><appmodules><appmodule>${APP_ID}</appmodule></appmodules><sitemaps><sitemap>${SITEMAP_ID}</sitemap></sitemaps></importexportxml>` } },
    ]);
  });

  it('run again with nothing changed, only publishes', async () => {
    const calls: RecordedCall[] = [];
    const state: State = {
      apps: [app],
      siteMaps: [{ sitemapid: SITEMAP_ID, sitemapnameunique: 'contoso_Visits', sitemapxml: xml }],
      components: [{ componenttype: 1, objectid: VISIT.toUpperCase() }, { componenttype: 1, objectid: CONTACT }, { componenttype: 62, objectid: SITEMAP_ID }],
    };

    const result = await service(state, calls).ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits', groups });

    expect(result).toMatchObject({ created: false, siteMapChanged: false, tablesAdded: [] });
    expect(writes(calls).map((c) => c.endpoint)).toEqual(['api/data/v9.2/PublishXml']);
  });

  it('rewrites a changed site map and adds only the tables the app lacks', async () => {
    const calls: RecordedCall[] = [];
    const state: State = {
      apps: [app],
      siteMaps: [{ sitemapid: SITEMAP_ID, sitemapnameunique: 'contoso_Visits', sitemapxml: '<SiteMap />' }],
      components: [{ componenttype: 1, objectid: VISIT }, { componenttype: 62, objectid: SITEMAP_ID }],
    };

    const result = await service(state, calls).ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits', groups, publish: false });

    expect(result).toMatchObject({ created: false, siteMapChanged: true, tablesAdded: ['contact'], published: false });
    expect(writes(calls)).toEqual([
      { method: 'PATCH', endpoint: `api/data/v9.2/sitemaps(${SITEMAP_ID})`, data: { sitemapxml: xml }, headers: undefined },
      { method: 'POST', endpoint: 'api/data/v9.2/AddAppComponents', headers: undefined,
        data: { AppId: APP_ID, Components: [{ '@odata.type': 'Microsoft.Dynamics.CRM.contact', contactid: CONTACT }] } },
    ]);
  });

  it('writes nothing when a table does not exist', async () => {
    const calls: RecordedCall[] = [];

    await expect(service({ apps: [], siteMaps: [], tables: { contoso_visit: VISIT, contact: undefined } }, calls)
      .ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits', groups })).rejects.toThrow("Table 'contact' was not found.");
    expect(writes(calls)).toHaveLength(0);
  });

  it('does not publish an app that ValidateApp finds errors in, and reports its warnings otherwise', async () => {
    const failing = service({ apps: [], siteMaps: [], issues: [{ ErrorType: 'Error', Message: 'No site map' }] }, []);
    await expect(failing.ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits', groups })).rejects.toThrow(/1 error\(s\).*No site map/);

    const calls: RecordedCall[] = [];
    const result = await service({ apps: [], siteMaps: [], issues: [
      { ErrorType: 'Warning', Message: 'No dashboard', DisplayName: 'Visits' },
      { ErrorType: 'Warning', Message: null, DisplayName: 'Site Map', RequiredComponents: [{ SchemaName: 'contoso_visit' }, { SchemaName: 'contact' }] },
    ] }, calls).ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits', groups });
    expect(result.warnings).toEqual([
      { errorType: 'Warning', message: 'Visits: No dashboard' },
      { errorType: 'Warning', message: 'Site Map: needs contoso_visit, contact' },
    ]);
    expect(writes(calls).at(-1)?.endpoint).toBe('api/data/v9.2/PublishXml');
  });

  it('refuses a table listed twice, an empty list and a unique name that is not an identifier, before any request', async () => {
    const calls: RecordedCall[] = [];
    const s = service({ apps: [], siteMaps: [] }, calls);

    await expect(s.ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits', groups: [...groups, { title: 'Again', tables: ['Contact'] }] }))
      .rejects.toThrow(/listed once only: contact/);
    await expect(s.ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits', groups: [] })).rejects.toThrow(/at least one table/);
    await expect(s.ensureApp({ uniqueName: 'contoso Visits', name: 'Visits', groups })).rejects.toThrow(/uniqueName must be a plain identifier/);
    expect(calls).toHaveLength(0);
  });
});

describe('buildSiteMapXml', () => {
  it('has one area, a group per list and a subarea per table, with escaped titles in the language given', () => {
    expect(buildSiteMapXml('contoso_Visits', 'Visits & "people"', [{ title: 'A<B', tables: ['contoso_visit'] }], 1045)).toBe(
      '<SiteMap IntroducedVersion="7.0.0.0"><Area Id="area_contoso_visits" ShowGroups="true">' +
      '<Titles><Title LCID="1045" Title="Visits &amp; &quot;people&quot;" /></Titles>' +
      '<Group Id="group_1" IsProfile="false"><Titles><Title LCID="1045" Title="A&lt;B" /></Titles>' +
      '<SubArea Id="subarea_contoso_visit" Entity="contoso_visit" /></Group></Area></SiteMap>');
  });
});

describe('pages', () => {
  it('a page is a subarea on its web resource, with its title and icon, before the group\'s tables', () => {
    expect(buildSiteMapXml('contoso_Visits', 'Visits', [
      { title: 'Visits', tables: ['contoso_visit'], pages: [{ title: 'Overview', webResource: 'contoso_/app/overview.html', icon: 'contoso_/app/overview.svg' }] },
    ], 1033)).toBe(
      '<SiteMap IntroducedVersion="7.0.0.0"><Area Id="area_contoso_visits" ShowGroups="true"><Titles><Title LCID="1033" Title="Visits" /></Titles>' +
      '<Group Id="group_1" IsProfile="false"><Titles><Title LCID="1033" Title="Visits" /></Titles>' +
      '<SubArea Id="subarea_page_1" Url="$webresource:contoso_/app/overview.html" VectorIcon="$webresource:contoso_/app/overview.svg" AvailableOffline="false" PassParams="false">' +
      '<Titles><Title LCID="1033" Title="Overview" /></Titles></SubArea>' +
      '<SubArea Id="subarea_contoso_visit" Entity="contoso_visit" /></Group></Area></SiteMap>');
  });

  it('writes nothing when a page\'s web resource does not exist', async () => {
    const calls: RecordedCall[] = [];
    const client = fakeClient([...routes({ apps: [], siteMaps: [] }), ['webresourceset?', { value: [] }]], calls);
    const service = new ModelDrivenAppService(client);

    await expect(service.ensureApp({ uniqueName: 'contoso_Visits', name: 'Visits',
      groups: [{ title: 'Visits', tables: ['contoso_visit'], pages: [{ title: 'Overview', webResource: 'contoso_/app/overview.html' }] }] }))
      .rejects.toThrow("Web resource 'contoso_/app/overview.html' was not found");
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });

  it('parses a page and puts it first in its group, a new group first', () => {
    expect(parsePageArg('Visits/Overview=contoso_/app/overview.html, contoso_/app/overview.svg'))
      .toEqual({ group: 'Visits', page: { title: 'Overview', webResource: 'contoso_/app/overview.html', icon: 'contoso_/app/overview.svg' } });
    expect(() => parsePageArg('Overview=contoso_/app/overview.html')).toThrow(/Group\/Title=/);
    expect(() => parsePageArg('Visits/Overview=')).toThrow(/names no web resource/);

    const result = addPages([{ title: 'Visits', tables: ['contoso_visit'] }], [
      { group: 'visits', page: { title: 'Overview', webResource: 'a.html' } },
      { group: 'Reports', page: { title: 'Monthly', webResource: 'b.html' } },
    ]);
    expect(result.map((g) => [g.title, g.pages!.map((p) => p.title), g.tables])).toEqual([
      ['Reports', ['Monthly'], []],
      ['Visits', ['Overview'], ['contoso_visit']],
    ]);
  });
});

describe('ModelDrivenAppService.getSolutionTables', () => {
  it("lists the solution's tables by display name", async () => {
    const service = new ModelDrivenAppService(fakeClient([
      ['solutions?', { value: [{ solutionid: 'dddddddd-0000-0000-0000-000000000001', uniquename: 'ContosoCore' }] }],
      ['solutioncomponents?', { value: [{ objectid: VISIT }, { objectid: CONTACT }] }],
      [`EntityDefinitions(${VISIT})`, { LogicalName: 'contoso_visit', DisplayCollectionName: { UserLocalizedLabel: { Label: 'Visits' } } }],
      [`EntityDefinitions(${CONTACT})`, { LogicalName: 'contact', DisplayCollectionName: { UserLocalizedLabel: { Label: 'Contacts' } } }],
    ]));

    expect(await service.getSolutionTables('ContosoCore')).toEqual(['contact', 'contoso_visit']);
  });
});

describe('parseGroupArg', () => {
  it('reads a title and its tables', () => {
    expect(parseGroupArg('Set-up = a, b ,c')).toEqual({ title: 'Set-up', tables: ['a', 'b', 'c'] });
  });

  it('refuses a group with no title or no tables', () => {
    expect(() => parseGroupArg('=a')).toThrow(/Title=table/);
    expect(() => parseGroupArg('Set-up=')).toThrow(/lists no tables/);
  });
});

describe('warningLines', () => {
  it('puts the same warning about several components on one line', () => {
    expect(warningLines([
      { errorType: 'Warning', message: 'Visits: no form or view' },
      { errorType: 'Warning', message: 'Contacts: no form or view' },
      { errorType: 'Warning', message: 'Site Map: needs contact' },
      { errorType: 'Warning', message: 'no message' },
    ])).toEqual([
      '  ⚠ Warning: no form or view (Visits, Contacts)',
      '  ⚠ Warning: needs contact (Site Map)',
      '  ⚠ Warning: no message',
    ]);
  });
});
