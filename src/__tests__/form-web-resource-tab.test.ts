import { describe, it, expect } from 'vitest';
import { FormViewService, buildWebResourceTabXml } from '../services/formview-service.js';
import { fakeClient, type Answer, type RecordedCall } from './fake-client.js';

const FORM = 'ffffffff-0000-0000-0000-000000000001';
const formXml = (tabs: string) => `<form><tabs><tab name="SUMMARY_TAB" id="{s}"><labels /></tab>${tabs}</tabs><header /></form>`;

function service(calls: RecordedCall[], xml: string, resource: unknown[] = [{ name: 'contoso_/app/visit.html', webresourcetype: 1 }]) {
  const routes: [string, Answer][] = [
    [`systemforms(${FORM})`, { formxml: xml, objecttypecode: 'contact', name: 'Contact' }],
    ['webresourceset?', { value: resource }],
    ['organizations?', { value: [{ languagecode: 1033 }] }],
  ];
  return new FormViewService(fakeClient(routes, calls));
}

describe('FormViewService.addWebResourceTab', () => {
  it('adds the tab last, in no solution, and publishes the table', async () => {
    const calls: RecordedCall[] = [];
    const result = await service(calls, formXml('')).addWebResourceTab(FORM, 'contact', { label: 'Visits', webResource: 'contoso_/app/visit.html', rows: 3 });

    expect(result).toMatchObject({ added: true, tabName: 'tab_visits', formName: 'Contact', saved: true });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.endpoint).toBe(`api/data/v9.2/systemforms(${FORM})`);
    expect(patch?.headers).toBeUndefined();
    const xml = (patch?.data as { formxml: string }).formxml;
    expect(xml.indexOf('name="tab_visits"')).toBeGreaterThan(xml.indexOf('SUMMARY_TAB'));
    expect(xml).toContain('<Url>contoso_/app/visit.html</Url><PassParameters>true</PassParameters>');
    expect(xml).toContain('rowspan="3"');
    expect(xml.match(/<row \/>/g)).toHaveLength(2);
    expect(xml.endsWith('</tab></tabs><header /></form>')).toBe(true);
    expect(calls.find((c) => c.endpoint === 'api/data/v9.2/PublishXml')?.data)
      .toEqual({ ParameterXml: '<importexportxml><entities><entity>contact</entity></entities></importexportxml>' });
  });

  it('run again, replaces its tab and keeps its ids', async () => {
    const before = buildWebResourceTabXml('tab_visits', 'Visits', 'contoso_/app/old.html', 2, true, 1033, { tab: '{t}', section: '{s2}', cell: '{c}' });
    const calls: RecordedCall[] = [];
    const result = await service(calls, formXml(before)).addWebResourceTab(FORM, 'contact', { label: 'Visits', webResource: 'contoso_/app/visit.html', rows: 5, solutionName: 'ContosoCore' });

    expect(result.added).toBe(false);
    const patch = calls.find((c) => c.method === 'PATCH');
    const xml = (patch?.data as { formxml: string }).formxml;
    expect(xml.match(/name="tab_visits"/g)).toHaveLength(1);
    expect(xml).toContain('id="{t}"');
    expect(xml).toContain('id="{c}"');
    expect(xml).toContain('<Url>contoso_/app/visit.html</Url>');
    expect(xml).not.toContain('old.html');
    expect(patch?.headers).toEqual({ 'MSCRM.SolutionUniqueName': 'ContosoCore' });
  });

  it("writes nothing for a web resource that is missing or not a page, another table's form, or a dry run", async () => {
    const calls: RecordedCall[] = [];
    await expect(service(calls, formXml(''), []).addWebResourceTab(FORM, 'contact', { label: 'Visits', webResource: 'contoso_/app/visit.html' }))
      .rejects.toThrow(/was not found/);
    await expect(service(calls, formXml(''), [{ name: 'contoso_/app/visit.html', webresourcetype: 3 }])
      .addWebResourceTab(FORM, 'contact', { label: 'Visits', webResource: 'contoso_/app/visit.html' })).rejects.toThrow(/not an HTML page/);
    await expect(service(calls, formXml('')).addWebResourceTab(FORM, 'account', { label: 'Visits', webResource: 'contoso_/app/visit.html' }))
      .rejects.toThrow(/belongs to 'contact'/);
    const dry = await service(calls, formXml('')).addWebResourceTab(FORM, 'contact', { label: 'Visits', webResource: 'contoso_/app/visit.html', dryRun: true });
    expect(dry.saved).toBe(false);
    expect(dry.formxml).toContain('tab_visits');
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });
});
