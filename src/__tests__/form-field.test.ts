import { describe, it, expect } from 'vitest';
import { FormViewService, findFieldRow } from '../services/formview-service.js';
import { fakeClient, type Answer, type RecordedCall } from './fake-client.js';

const FORM = 'ffffffff-0000-0000-0000-000000000002';
const row = (field: string, id: string) =>
  `<row><cell id="{${id}}" showlabel="true"><labels><label description="${field}" languagecode="1033" /></labels><control id="${field}" classid="{x}" datafieldname="${field}" disabled="false" /></cell></row>`;
const formXml = `<form><tabs><tab name="general"><columns><column width="66%"><sections><section name="details"><rows>`
  + row('contoso_name', 'a') + row('contoso_points', 'b') + row('contoso_halflife', 'c')
  + `</rows></section><section name="system"><rows>` + row('createdon', 'd') + `</rows></section></sections></column></columns></tab></tabs></form>`;

const decimal = { LogicalName: 'contoso_share', AttributeType: 'Decimal', DisplayName: { UserLocalizedLabel: { Label: 'Share of Score (%)' } } };

function service(calls: RecordedCall[], attribute: unknown = decimal) {
  const routes: [string, Answer][] = [
    [`systemforms(${FORM})`, { formxml: formXml }],
    ["Attributes(LogicalName='contoso_share')", attribute],
  ];
  return new FormViewService(fakeClient(routes, calls));
}

const saved = (calls: RecordedCall[]) => (calls.find((c) => c.method === 'PATCH')?.data as { formxml: string }).formxml;

describe('FormViewService.addFormField', () => {
  it('puts the field after the named one, locked, with its display name and its type\'s control, then publishes', async () => {
    const calls: RecordedCall[] = [];

    const result = await service(calls).addFormField(FORM, 'contoso_share', 'contoso_type', { after: 'contoso_halflife', readOnly: true });

    expect(result).toEqual({ added: true });
    const xml = saved(calls);
    const order = ['contoso_name', 'contoso_points', 'contoso_halflife', 'contoso_share', 'createdon'].map((f) => xml.indexOf(`datafieldname="${f}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(xml).toMatch(/<label description="Share of Score \(%\)" languagecode="1033" \/><\/labels><control id="contoso_share" classid="\{C3EFE0C3-0EC6-42be-8349-CBD9079DFD8E\}" datafieldname="contoso_share" disabled="true" \/>/);
    expect(xml.indexOf('contoso_share')).toBeLessThan(xml.indexOf('name="system"'));
    expect(calls.find((c) => c.endpoint === 'api/data/v9.2/PublishXml')).toBeDefined();
  });

  it('without a place, adds the field unlocked at the end of the first section, with a given label', async () => {
    const calls: RecordedCall[] = [];

    await service(calls).addFormField(FORM, 'contoso_share', 'contoso_type', { label: 'Share <%>' });

    const xml = saved(calls);
    expect(xml.indexOf('datafieldname="contoso_share"')).toBeGreaterThan(xml.indexOf('datafieldname="contoso_halflife"'));
    expect(xml.indexOf('datafieldname="contoso_share"')).toBeLessThan(xml.indexOf('name="system"'));
    expect(xml).toContain('<label description="Share &lt;%&gt;" languagecode="1033" />');
    expect(xml).toContain('datafieldname="contoso_share" disabled="false"');
  });

  it('refuses a place that is not on the form, and writes nothing', async () => {
    const calls: RecordedCall[] = [];

    await expect(service(calls).addFormField(FORM, 'contoso_share', 'contoso_type', { after: 'contoso_missing' }))
      .rejects.toThrow("'contoso_missing' is not on form");
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });

  it('does nothing when the field is already on the form', async () => {
    const calls: RecordedCall[] = [];

    expect(await service(calls).addFormField(FORM, 'contoso_points', 'contoso_type')).toEqual({ added: false });
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });
});

describe('FormViewService.removeFormField', () => {
  it('removes only the field\'s own row, not the rows before it', async () => {
    const calls: RecordedCall[] = [];

    expect(await service(calls).removeFormField(FORM, 'contoso_halflife', 'contoso_type')).toEqual({ removed: true });

    const xml = saved(calls);
    expect(xml).not.toContain('datafieldname="contoso_halflife"');
    expect(xml).toContain('datafieldname="contoso_name"');
    expect(xml).toContain('datafieldname="contoso_points"');
    expect(xml).toBe(formXml.replace(row('contoso_halflife', 'c'), ''));
  });
});

describe('findFieldRow', () => {
  it('finds the row of the exact field, not one whose name starts the same', () => {
    const xml = row('contoso_points2', 'x') + row('contoso_points', 'y');
    const found = findFieldRow(xml, 'contoso_points')!;
    expect(xml.slice(found.start, found.end)).toBe(row('contoso_points', 'y'));
    expect(findFieldRow(xml, 'contoso_point')).toBeNull();
  });
});
