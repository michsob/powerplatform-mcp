import { createHash } from 'crypto';

/**
 * Declarative layout for the body (and optionally the header) of a Dataverse form.
 * `buildFormXml` turns it into formxml, replacing the form's <tabs> and <header>
 * while keeping everything else (events, libraries, navigation, footer, …) untouched.
 *
 * A field item can be written as just the attribute logical name ("contoso_name"),
 * or as an object when it needs a label, read-only or hidden setting.
 */
export interface FormFieldSpec {
  /** Attribute logical name. */
  field: string;
  /** Cell label. Defaults to the attribute's display name. */
  label?: string;
  /** Render the control disabled (read-only). Default false. */
  readOnly?: boolean;
  /** Default true. A hidden field stays on the form so scripts and business rules can use it. */
  visible?: boolean;
  /** Default true. */
  showLabel?: boolean;
}

export interface FormSubgridSpec {
  /** Control name, unique on the form (e.g. "Tasks"). */
  subgrid: string;
  label: string;
  /** Logical name of the related table the grid lists. */
  entity: string;
  /** Relationship schema name. Omit to list all records of `entity` instead of related ones. */
  relationship?: string;
  /** savedquery id of the view the grid uses. */
  viewId: string;
  /** Default 5. */
  recordsPerPage?: number;
  /** Default false. */
  enableViewPicker?: boolean;
  /** Default false. */
  enableQuickFind?: boolean;
  /** Default true. */
  showLabel?: boolean;
  /** Default true. */
  visible?: boolean;
}

export type FormItemSpec = string | FormFieldSpec | FormSubgridSpec;

export interface FormSectionSpec {
  /** Section name, unique on the form; scripts address the section by it. */
  name: string;
  label: string;
  /** Default true. */
  showLabel?: boolean;
  /** Default true. */
  visible?: boolean;
  /** Number of field columns inside the section (1–4). Default 1. */
  columns?: number;
  items: FormItemSpec[];
}

export interface FormColumnSpec {
  /** Column width, e.g. "66%". */
  width: string;
  sections: FormSectionSpec[];
}

export interface FormTabSpec {
  /** Tab name, unique on the form. */
  name: string;
  label: string;
  /** Default true. */
  showLabel?: boolean;
  /** Default true. */
  visible?: boolean;
  /** Default true. */
  expanded?: boolean;
  /** Tab columns. Give either `columns` or `sections` (shorthand for one 100% column). */
  columns?: FormColumnSpec[];
  sections?: FormSectionSpec[];
}

export interface FormLayoutSpec {
  tabs: FormTabSpec[];
  /**
   * Header fields. Omit to keep the form's current header; `[]` removes it.
   * Header controls get the usual `header_` id prefix.
   */
  header?: (string | FormFieldSpec)[];
  /** Label language. Default 1033. */
  languageCode?: number;
}

/** The attribute metadata the builder needs: type for the control and display name for the label. */
export interface FormAttributeInfo {
  logicalName: string;
  attributeType: string;
  attributeTypeName?: string;
  displayName?: string;
}

export interface FormLayoutResult {
  formxml: string;
  /** Fields placed in the body, in order. */
  fields: string[];
  /** Header fields, when the spec set the header. */
  headerFields?: string[];
  /** Subgrid control names. */
  subgrids: string[];
}

const SUBGRID_CLASSID = '{E7A81278-8635-4d9e-8D4D-59480B391C5B}';
const TEXT_CLASSID = '{4273EDBD-AC1D-40d3-9FB2-095C621B552D}';

/** Form control classid for each attribute type, as the form editor writes them. */
const CLASSID_BY_TYPE: Record<string, string> = {
  String: TEXT_CLASSID,
  Memo: '{E0DECE4B-6FC8-4a8f-A065-082708572369}',
  Integer: '{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}',
  BigInt: '{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}',
  Decimal: '{C3EFE0C3-0EC6-42be-8349-CBD9079DFD8E}',
  Double: '{0D2C745A-E5A8-4c8f-BA63-C6D3BB604660}',
  Money: '{533B9E00-756B-4312-95A0-DC888637AC78}',
  DateTime: '{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}',
  Boolean: '{67FAC785-CD58-4f9f-ABB3-4B7DDC6ED5ED}',
  Picklist: '{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}',
  State: '{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}',
  Status: '{5D68B988-0661-4db2-BC3E-17598AD3BE6C}',
  Lookup: '{270BD3DB-D9AF-4782-9025-509E298DEC0A}',
  Customer: '{270BD3DB-D9AF-4782-9025-509E298DEC0A}',
  Owner: '{270BD3DB-D9AF-4782-9025-509E298DEC0A}',
};
const MULTISELECT_CLASSID = '{4AA28AB7-9C13-4F57-A73D-AD894D048B5F}';

export function controlClassId(attr: FormAttributeInfo): string {
  if (attr.attributeTypeName === 'MultiSelectPicklistType') return MULTISELECT_CLASSID;
  return CLASSID_BY_TYPE[attr.attributeType] ?? TEXT_CLASSID;
}

/**
 * A GUID derived from a seed, so re-applying the same layout to the same form keeps
 * the same tab, section and cell ids (no churn in solution diffs or user personalisation).
 */
export function stableGuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  // Shape it as an RFC 4122 version-5 style GUID.
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}}`;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isSubgrid(item: FormItemSpec): item is FormSubgridSpec {
  return typeof item === 'object' && 'subgrid' in item;
}

function asField(item: string | FormFieldSpec): FormFieldSpec {
  return typeof item === 'string' ? { field: item } : item;
}

const GUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

/**
 * Build the formxml for a layout spec.
 *
 * @param currentFormXml The form's current formxml; everything outside <tabs> (and <header>, when the spec sets one) is kept.
 * @param spec The layout to apply.
 * @param attributes Metadata for the form's table, keyed by logical name.
 * @param seed Seed for stable ids, normally the form id.
 */
export function buildFormXml(
  currentFormXml: string,
  spec: FormLayoutSpec,
  attributes: Map<string, FormAttributeInfo>,
  seed: string,
): FormLayoutResult {
  const lang = spec.languageCode ?? 1033;
  const errors: string[] = [];
  const bodyFields: string[] = [];
  const subgrids: string[] = [];
  const names = new Set<string>();

  if (!Array.isArray(spec.tabs) || spec.tabs.length === 0) {
    throw new Error('Form layout needs at least one tab.');
  }

  const label = (text: string) => `<labels><label description="${escapeXml(text)}" languagecode="${lang}" /></labels>`;
  const visibleAttr = (visible?: boolean) => (visible === false ? ' visible="false"' : '');
  const uniqueName = (kind: string, name: string) => {
    if (!name) errors.push(`Every ${kind} needs a name.`);
    else if (names.has(`${kind}:${name}`)) errors.push(`Duplicate ${kind} name '${name}'.`);
    names.add(`${kind}:${name}`);
  };

  const fieldCell = (item: FormFieldSpec, controlId: string, cellSeed: string): string => {
    const attr = attributes.get(item.field.toLowerCase());
    if (!attr) {
      errors.push(`'${item.field}' is not an attribute of this table.`);
      return '';
    }
    const text = item.label ?? attr.displayName ?? attr.logicalName;
    const showLabel = item.showLabel === false ? 'false' : 'true';
    return `<cell id="${stableGuid(cellSeed)}" showlabel="${showLabel}"${visibleAttr(item.visible)}>`
      + label(text)
      + `<control id="${controlId}" classid="${controlClassId(attr)}" datafieldname="${attr.logicalName}" disabled="${item.readOnly ? 'true' : 'false'}" />`
      + `</cell>`;
  };

  const subgridCell = (item: FormSubgridSpec, colspan: number): string => {
    uniqueName('control', item.subgrid);
    if (!item.entity) errors.push(`Subgrid '${item.subgrid}' needs an entity.`);
    if (!item.viewId || !GUID_RE.test(item.viewId)) errors.push(`Subgrid '${item.subgrid}' needs a viewId GUID.`);
    subgrids.push(item.subgrid);
    const viewId = `{${(item.viewId ?? '').replace(/[{}]/g, '').toUpperCase()}}`;
    const showLabel = item.showLabel === false ? 'false' : 'true';
    const params = [
      `<ViewId>${viewId}</ViewId>`,
      `<IsUserView>false</IsUserView>`,
      item.relationship ? `<RelationshipName>${escapeXml(item.relationship)}</RelationshipName>` : '',
      `<TargetEntityType>${escapeXml(item.entity ?? '')}</TargetEntityType>`,
      `<AutoExpand>Fixed</AutoExpand>`,
      `<EnableQuickFind>${item.enableQuickFind ? 'true' : 'false'}</EnableQuickFind>`,
      `<EnableViewPicker>${item.enableViewPicker ? 'true' : 'false'}</EnableViewPicker>`,
      `<ViewIds />`,
      `<EnableJumpBar>false</EnableJumpBar>`,
      `<ChartGridMode>Grid</ChartGridMode>`,
      `<VisualizationId />`,
      `<IsUserChart>false</IsUserChart>`,
      `<EnableChartPicker>false</EnableChartPicker>`,
      `<RecordsPerPage>${item.recordsPerPage ?? 5}</RecordsPerPage>`,
    ].join('');
    // No rowspan: in Unified Interface the grid sizes itself from RecordsPerPage,
    // and a rowspan would hide the cells below it.
    return `<cell id="${stableGuid(`${seed}:subgrid:${item.subgrid}`)}" showlabel="${showLabel}" colspan="${colspan}" auto="false"${visibleAttr(item.visible)}>`
      + label(item.label)
      + `<control id="${escapeXml(item.subgrid)}" classid="${SUBGRID_CLASSID}" indicationOfSubgrid="true"><parameters>${params}</parameters></control>`
      + `</cell>`;
  };

  const sectionXml = (section: FormSectionSpec): string => {
    uniqueName('section', section.name);
    const cols = section.columns ?? 1;
    if (!Number.isInteger(cols) || cols < 1 || cols > 4) errors.push(`Section '${section.name}' columns must be 1–4.`);
    const rows: string[] = [];
    let row: string[] = [];
    const flush = () => {
      if (row.length) rows.push(`<row>${row.join('')}</row>`);
      row = [];
    };
    for (const item of section.items ?? []) {
      if (isSubgrid(item)) {
        flush();
        rows.push(`<row>${subgridCell(item, cols)}</row>`);
        continue;
      }
      const field = asField(item);
      const key = field.field?.toLowerCase();
      if (!key) {
        errors.push(`Section '${section.name}' has an item with no field.`);
        continue;
      }
      if (bodyFields.includes(key)) errors.push(`'${key}' is on the form more than once.`);
      bodyFields.push(key);
      row.push(fieldCell(field, key, `${seed}:cell:${key}`));
      if (row.length === cols) flush();
    }
    flush();
    const showLabel = section.showLabel === false ? 'false' : 'true';
    return `<section name="${escapeXml(section.name)}" id="${stableGuid(`${seed}:section:${section.name}`)}" showlabel="${showLabel}" showbar="false" IsUserDefined="0" columns="${cols}"${visibleAttr(section.visible)}>`
      + label(section.label)
      + `<rows>${rows.join('')}</rows>`
      + `</section>`;
  };

  const tabXml = (tab: FormTabSpec): string => {
    uniqueName('tab', tab.name);
    const columns = tab.columns ?? (tab.sections ? [{ width: '100%', sections: tab.sections }] : []);
    if (columns.length === 0) errors.push(`Tab '${tab.name}' needs columns or sections.`);
    const showLabel = tab.showLabel === false ? 'false' : 'true';
    const expanded = tab.expanded === false ? 'false' : 'true';
    const columnsXml = columns
      .map(c => `<column width="${escapeXml(c.width)}"><sections>${(c.sections ?? []).map(sectionXml).join('')}</sections></column>`)
      .join('');
    return `<tab name="${escapeXml(tab.name)}" id="${stableGuid(`${seed}:tab:${tab.name}`)}" IsUserDefined="1" verticallayout="true" expanded="${expanded}" showlabel="${showLabel}"${visibleAttr(tab.visible)}>`
      + label(tab.label)
      + `<columns>${columnsXml}</columns>`
      + `</tab>`;
  };

  const tabsXml = `<tabs>${spec.tabs.map(tabXml).join('')}</tabs>`;

  let headerXml: string | undefined;
  let headerFields: string[] | undefined;
  if (spec.header !== undefined) {
    headerFields = [];
    const cells: string[] = [];
    for (const item of spec.header) {
      const field = asField(item);
      const key = field.field?.toLowerCase();
      if (!key) {
        errors.push('A header item has no field.');
        continue;
      }
      if (headerFields.includes(key)) errors.push(`'${key}' is in the header more than once.`);
      headerFields.push(key);
      cells.push(fieldCell(field, `header_${key}`, `${seed}:header:${key}`));
    }
    headerXml = cells.length
      ? `<header id="${stableGuid(`${seed}:header`)}" celllabelposition="Top" columns="${'1'.repeat(Math.max(cells.length, 1))}" labelwidth="115" celllabelalignment="Left"><rows><row>${cells.join('')}</row></rows></header>`
      : '';
  }

  if (errors.length) {
    throw new Error(`Invalid form layout:\n  ${[...new Set(errors)].join('\n  ')}`);
  }

  let xml = currentFormXml || '<form></form>';
  if (/<tabs\s*\/>/.test(xml)) xml = xml.replace(/<tabs\s*\/>/, tabsXml);
  else if (/<tabs>[\s\S]*<\/tabs>/.test(xml)) xml = xml.replace(/<tabs>[\s\S]*<\/tabs>/, () => tabsXml);
  else xml = xml.replace(/<form([^>]*)>/, (m) => `${m}${tabsXml}`);

  if (headerXml !== undefined) {
    const headerRe = /<header\b[^>]*\/>|<header\b[^>]*>[\s\S]*?<\/header>/;
    if (headerRe.test(xml)) xml = xml.replace(headerRe, () => headerXml!);
    else xml = xml.replace('</tabs>', () => `</tabs>${headerXml}`);
  }

  return { formxml: xml, fields: bodyFields, headerFields, subgrids };
}
