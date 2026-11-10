import { describe, expect, it } from 'vitest';
import { buildFormXml, controlClassId, stableGuid } from '../services/form-layout.js';
import type { FormAttributeInfo, FormLayoutSpec } from '../services/form-layout.js';
import { buildQuickFindFilter, buildViewFetchXml, buildViewLayoutXml } from '../services/formview-service.js';

const attrs = new Map<string, FormAttributeInfo>([
  ['contoso_name', { logicalName: 'contoso_name', attributeType: 'String', displayName: 'Name' }],
  ['contoso_points', { logicalName: 'contoso_points', attributeType: 'Integer', displayName: 'Points' }],
  ['contoso_notes', { logicalName: 'contoso_notes', attributeType: 'Memo', displayName: 'Notes & "Remarks"' }],
  ['contoso_typeid', { logicalName: 'contoso_typeid', attributeType: 'Lookup', displayName: 'Type' }],
  ['createdon', { logicalName: 'createdon', attributeType: 'DateTime', displayName: 'Created On' }],
  ['ownerid', { logicalName: 'ownerid', attributeType: 'Owner', displayName: 'Owner' }],
]);

const CURRENT = '<form><tabs><tab id="{old}"><labels /></tab></tabs><events><event name="onload" /></events></form>';

const spec: FormLayoutSpec = {
  tabs: [{
    name: 'general',
    label: 'General',
    columns: [
      { width: '66%', sections: [{ name: 'details', label: 'Details', items: ['contoso_name', { field: 'contoso_points', readOnly: true }, 'contoso_notes'] }] },
      { width: '34%', sections: [{ name: 'system', label: 'System', items: [{ field: 'createdon', readOnly: true }, { field: 'ownerid', visible: false }] }] },
    ],
  }],
};

describe('buildFormXml', () => {
  it('replaces the tabs and keeps the rest of the form', () => {
    const { formxml, fields } = buildFormXml(CURRENT, spec, attrs, 'form1');
    expect(formxml).not.toContain('{old}');
    expect(formxml).toContain('<events><event name="onload" /></events>');
    expect(formxml.match(/<tabs>/g)).toHaveLength(1);
    expect(fields).toEqual(['contoso_name', 'contoso_points', 'contoso_notes', 'createdon', 'ownerid']);
  });

  it('labels from display names, classids by type, read-only and hidden flags', () => {
    const { formxml } = buildFormXml(CURRENT, spec, attrs, 'form1');
    expect(formxml).toContain('<label description="Points" languagecode="1033" />');
    expect(formxml).toContain('<label description="Notes &amp; &quot;Remarks&quot;" languagecode="1033" />');
    expect(formxml).toContain(`<control id="contoso_points" classid="${controlClassId(attrs.get('contoso_points')!)}" datafieldname="contoso_points" disabled="true" />`);
    expect(formxml).toContain('classid="{E0DECE4B-6FC8-4a8f-A065-082708572369}" datafieldname="contoso_notes" disabled="false"');
    expect(formxml).toMatch(/<cell id="\{[^}]+\}" showlabel="true" visible="false"><labels><label description="Owner"/);
    expect(formxml).toContain('<column width="66%">');
    expect(formxml).toContain('<section name="system"');
  });

  it('gives the same ids every time for the same form', () => {
    expect(buildFormXml(CURRENT, spec, attrs, 'form1').formxml).toBe(buildFormXml(CURRENT, spec, attrs, 'form1').formxml);
    expect(buildFormXml(CURRENT, spec, attrs, 'form1').formxml).not.toBe(buildFormXml(CURRENT, spec, attrs, 'form2').formxml);
    expect(stableGuid('x')).toMatch(/^\{[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}$/);
  });

  it('builds a subgrid without rowspan, spanning the section columns', () => {
    const { formxml, subgrids } = buildFormXml(CURRENT, {
      tabs: [{
        name: 'general', label: 'General', sections: [{
          name: 'related', label: 'Related', columns: 2, items: ['contoso_name', 'contoso_points', {
            subgrid: 'Tasks', label: 'Tasks', entity: 'contoso_task',
            relationship: 'contoso_type_task_typeid', viewId: '00000000-0000-0000-0000-000000000002', recordsPerPage: 10,
          }],
        }],
      }],
    }, attrs, 'form1');
    expect(subgrids).toEqual(['Tasks']);
    expect(formxml).toContain('<column width="100%">');
    expect(formxml).toContain('<ViewId>{00000000-0000-0000-0000-000000000002}</ViewId>');
    expect(formxml).toContain('<RelationshipName>contoso_type_task_typeid</RelationshipName>');
    expect(formxml).toContain('<RecordsPerPage>10</RecordsPerPage>');
    expect(formxml).toContain('colspan="2"');
    expect(formxml).not.toContain('rowspan');
    // The two fields share a row, the subgrid gets its own.
    expect(formxml.match(/<row>/g)).toHaveLength(2);
  });

  it('replaces, adds or removes the header only when the spec sets one', () => {
    const withHeader = '<form><tabs></tabs><header id="{h}"><rows><row /></rows></header></form>';
    expect(buildFormXml(withHeader, spec, attrs, 'f').formxml).toContain('<header id="{h}">');
    const replaced = buildFormXml(withHeader, { ...spec, header: [{ field: 'contoso_points', readOnly: true }, 'contoso_name'] }, attrs, 'f');
    expect(replaced.formxml).not.toContain('<header id="{h}">');
    expect(replaced.formxml).toContain('<control id="header_contoso_points"');
    expect(replaced.formxml).toContain('columns="11"');
    expect(replaced.headerFields).toEqual(['contoso_points', 'contoso_name']);
    const added = buildFormXml(CURRENT, { ...spec, header: ['contoso_points'] }, attrs, 'f').formxml;
    expect(added.indexOf('<header')).toBe(added.indexOf('</tabs>') + '</tabs>'.length);
    expect(buildFormXml(withHeader, { ...spec, header: [] }, attrs, 'f').formxml).not.toContain('<header');
  });

  it('reports unknown, duplicate and malformed items together', () => {
    expect(() => buildFormXml(CURRENT, {
      tabs: [{
        name: 'general', label: 'General', sections: [
          { name: 'a', label: 'A', items: ['contoso_name', 'contoso_nope'] },
          { name: 'a', label: 'A again', items: ['contoso_name', { subgrid: 'Grid', label: 'Grid', entity: 'x', viewId: 'not-a-guid' }] },
        ],
      }],
    }, attrs, 'f')).toThrow(/contoso_nope' is not an attribute[\s\S]*Duplicate section name 'a'[\s\S]*'contoso_name' is on the form more than once[\s\S]*viewId GUID/);
    expect(() => buildFormXml(CURRENT, { tabs: [] }, attrs, 'f')).toThrow(/at least one tab/);
  });
});

describe('view xml helpers', () => {
  it('builds layout and fetch xml', () => {
    const cols = [{ name: 'contoso_name', width: 200 }, { name: 'createdon' }];
    expect(buildViewLayoutXml('<grid name="resultset" object="1" jump="contoso_name">', 'contoso_xid', cols))
      .toBe('<grid name="resultset" object="1" jump="contoso_name"><row name="result" id="contoso_xid"><cell name="contoso_name" width="200" /><cell name="createdon" width="150" /></row></grid>');
    expect(buildViewFetchXml('contoso_x', cols, 'contoso_xid', 'createdon', true, '<filter type="and" />'))
      .toBe('<fetch version="1.0" output-format="xml-platform" mapping="logical"><entity name="contoso_x"><attribute name="contoso_name" /><attribute name="createdon" /><attribute name="contoso_xid" /><order attribute="createdon" descending="true" /><filter type="and" /></entity></fetch>');
    expect(buildViewFetchXml('contoso_x', [{ name: 'contoso_xid' }], 'contoso_xid', undefined, false))
      .toBe('<fetch version="1.0" output-format="xml-platform" mapping="logical"><entity name="contoso_x"><attribute name="contoso_xid" /><order attribute="contoso_xid" descending="false" /></entity></fetch>');
  });

  it('builds the quick find filter', () => {
    expect(buildQuickFindFilter(['contoso_name', 'contoso_key']))
      .toBe('<filter type="or" isquickfindfields="1"><condition attribute="contoso_name" operator="like" value="{0}" /><condition attribute="contoso_key" operator="like" value="{0}" /></filter>');
  });
});
