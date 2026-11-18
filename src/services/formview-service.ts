import { PowerPlatformClient } from '../powerplatform-client.js';
import { odataGuid, odataInteger, odataString } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';
import { randomUUID } from 'crypto';
import { buildFormXml, controlClassId, escapeXml } from './form-layout.js';
import type { FormAttributeInfo, FormLayoutResult, FormLayoutSpec } from './form-layout.js';

/** Where `addFormField` puts a field, whether it is locked, and its label. */
export interface AddFormFieldOptions {
  /** The logical name of a field on the form: the new row goes right after that field's row. */
  after?: string;
  /** Lock the field (the control's `disabled`). */
  readOnly?: boolean;
  /** The cell's label; the column's display name when left out. */
  label?: string;
}

/**
 * The `<row>` that holds the control bound to `attributeName`: its start and end in the formxml, or null when the field
 * is not on the form. The match stays inside one row: a pattern that runs from the first `<row>` to the field would also
 * take every row before it.
 */
export function findFieldRow(xml: string, attributeName: string): { start: number; end: number } | null {
  const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rowRegex = new RegExp(`<row\\b[^>]*>(?:(?!<\\/row>)[\\s\\S])*?datafieldname="${escaped}"(?:(?!<\\/row>)[\\s\\S])*?<\\/row>`, 'i');
  const match = rowRegex.exec(xml);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/** Classid of an HTML web resource on a form. */
const WEB_RESOURCE_CONTROL_CLASSID = '{9FDF5F91-88B1-47f4-AD53-C11EFC01A01D}';

export interface WebResourceTabOptions {
  /** The tab's label. */
  label: string;
  /** The HTML web resource the tab shows. */
  webResource: string;
  /** The tab's name (default: tab_<label as an identifier>). */
  tabName?: string;
  /** The web resource's height in form rows (default 40). */
  rows?: number;
  /** Pass the record's type and id to the web resource (default true). */
  passParameters?: boolean;
  /** LCID of the labels (default: the organization's base language). */
  languageCode?: number;
  /** Add the form to this solution; without it the form joins no solution. */
  solutionName?: string;
  /** Build the formxml without saving it. */
  dryRun?: boolean;
}

/** A tab with one section holding one HTML web resource, its label hidden, N rows high. */
export function buildWebResourceTabXml(
  tabName: string,
  label: string,
  webResource: string,
  rows: number,
  passParameters: boolean,
  languageCode: number,
  ids: { tab: string; section: string; cell: string },
): string {
  const text = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const labels = `<labels><label description="${text(label)}" languagecode="${languageCode}" /></labels>`;
  return `<tab name="${tabName}" id="${ids.tab}" IsUserDefined="1" locklevel="0" showlabel="true" expanded="true" verticallayout="true">${labels}` +
    '<columns><column width="100%"><sections>' +
    `<section name="${tabName}_section" showlabel="false" showbar="false" locklevel="0" id="${ids.section}" IsUserDefined="1" layout="varwidth" columns="1" labelwidth="115" celllabelalignment="Left" celllabelposition="Left">${labels}` +
    `<rows><row><cell id="${ids.cell}" showlabel="false" colspan="1" auto="false" rowspan="${rows}">${labels}` +
    `<control id="WebResource_${tabName}" classid="${WEB_RESOURCE_CONTROL_CLASSID}"><parameters><Url>${text(webResource)}</Url>` +
    `<PassParameters>${passParameters}</PassParameters><Security>false</Security><Scrolling>auto</Scrolling><Border>false</Border></parameters></control>` +
    '</cell></row>' + '<row />'.repeat(rows - 1) + '</rows></section></sections></column></columns></tab>';
}

const QUICK_FIND_QUERY_TYPE = 4;

/** layoutxml for a view grid: one row of cells in display order. */
export function buildViewLayoutXml(gridOpen: string, rowId: string, columns: { name: string; width?: number }[]): string {
  const cells = columns.map(c => `<cell name="${c.name}" width="${c.width ?? 150}" />`).join('');
  return `${gridOpen}<row name="result" id="${rowId}">${cells}</row></grid>`;
}

/** fetchxml for a view: the columns, the primary key, one sort order, then any filters/link-entities. */
export function buildViewFetchXml(
  entityLogicalName: string,
  columns: { name: string }[],
  primaryIdAttribute: string,
  orderBy: string | undefined,
  orderDescending: boolean,
  innerXml = '',
): string {
  const attrs = columns.map(c => `<attribute name="${c.name}" />`).join('');
  const pkAttr = columns.some(c => c.name === primaryIdAttribute) ? '' : `<attribute name="${primaryIdAttribute}" />`;
  const order = `<order attribute="${orderBy ?? columns[0].name}" descending="${orderDescending}" />`;
  return `<fetch version="1.0" output-format="xml-platform" mapping="logical"><entity name="${entityLogicalName}">${attrs}${pkAttr}${order}${innerXml}</entity></fetch>`;
}

/** The Quick Find filter: the search text ({0}) matched with `like` against each column. */
export function buildQuickFindFilter(findColumns: string[]): string {
  const conditions = findColumns.map(c => `<condition attribute="${c}" operator="like" value="{0}" />`).join('');
  return `<filter type="or" isquickfindfields="1">${conditions}</filter>`;
}

export interface FormSummary {
  formid: string;
  name: string;
  type: number;       // 2 = Main, 5 = Quick View, 6 = Quick Create, 7 = Dashboard
  description?: string;
}

export interface ViewSummary {
  savedqueryid: string;
  name: string;
  querytype: number;
  isdefault: boolean;
  description?: string;
}

/**
 * Service for managing Dataverse forms (systemform) and views (savedquery).
 */
export class FormViewService {
  constructor(private client: PowerPlatformClient) {}

  // ─── FORMS ─────────────────────────────────────────────────────────────────

  /**
   * List forms for an entity.
   * @param entityLogicalName The entity logical name
   * @param type Form type filter (default: 2 = Main)
   */
  async getEntityForms(entityLogicalName: string, type?: number): Promise<FormSummary[]> {
    // objecttypecode on systemforms accepts the entity logical name as a string.
    let filter = `objecttypecode eq ${odataString(entityLogicalName)}`;
    if (type !== undefined) filter += ` and type eq ${odataInteger(type, 'type')}`;

    const result = await this.client.get<ApiCollectionResponse<FormSummary>>(
      `api/data/v9.2/systemforms?$select=formid,name,type,description&$filter=${filter}`,
    );
    return result.value ?? [];
  }

  /**
   * Get the fields currently on a form by parsing its formxml.
   * Returns the list of `datafieldname` values found in `<control>` elements.
   */
  async getFormFields(formId: string): Promise<string[]> {
    const form = await this.client.get<{ formxml: string }>(
      `api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})?$select=formxml`,
    );
    const xml = form.formxml ?? '';
    const fields: string[] = [];
    const re = /datafieldname="([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(xml)) !== null) {
      fields.push(match[1]);
    }
    return fields;
  }

  /**
   * Add a field to a form, as a new row with one cell. It goes after the row of the field named in `options.after`, or
   * at the end of the first section when there is none. The cell's label is `options.label`, or the column's display
   * name; its control gets the classid for the column's type, as the form editor writes it; `options.readOnly` locks it.
   * If the field is already present, this is a no-op.
   *
   * @param formId The systemform GUID
   * @param attributeName The logical name of the attribute to add
   * @param entityLogicalName The form's entity: its attribute's type and display name, and the publish afterwards
   * @param options Where the field goes, whether it is locked, and its label
   */
  async addFormField(
    formId: string,
    attributeName: string,
    entityLogicalName: string,
    options: AddFormFieldOptions = {},
  ): Promise<{ added: boolean }> {
    const form = await this.client.get<{ formxml: string }>(
      `api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})?$select=formxml`,
    );
    let xml = form.formxml ?? '';

    // Check if the field is already on the form.
    if (findFieldRow(xml, attributeName)) {
      return { added: false };
    }

    const attribute = await this.client.get<{
      LogicalName: string;
      AttributeType: string;
      AttributeTypeName?: { Value: string };
      DisplayName?: { UserLocalizedLabel?: { Label: string } | null };
    }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityLogicalName)})/Attributes(LogicalName=${odataString(attributeName)})?$select=LogicalName,AttributeType,AttributeTypeName,DisplayName`,
    );
    const classId = controlClassId({
      logicalName: attribute.LogicalName,
      attributeType: attribute.AttributeType,
      attributeTypeName: attribute.AttributeTypeName?.Value,
    });
    const label = options.label ?? attribute.DisplayName?.UserLocalizedLabel?.Label ?? attributeName;

    // Build the new row element.
    const cellId = `{${randomUUID()}}`;
    const newRow = `<row><cell id="${cellId}" showlabel="true" locklevel="0"><labels><label description="${escapeXml(label)}" languagecode="1033" /></labels>`
      + `<control id="${escapeXml(attributeName)}" classid="${classId}" datafieldname="${escapeXml(attributeName)}" disabled="${options.readOnly ? 'true' : 'false'}" /></cell></row>`;

    if (options.after) {
      const row = findFieldRow(xml, options.after);
      if (!row) {
        throw new Error(`'${options.after}' is not on form ${formId}, so '${attributeName}' cannot go after it.`);
      }
      xml = xml.substring(0, row.end) + newRow + xml.substring(row.end);
    } else {
      // Insert before the closing </rows> of the first section.
      const rowsCloseIdx = xml.indexOf('</rows>');
      if (rowsCloseIdx === -1) {
        throw new Error('Could not find </rows> in formxml — form may have an unexpected structure.');
      }
      xml = xml.substring(0, rowsCloseIdx) + newRow + xml.substring(rowsCloseIdx);
    }

    // Patch the form.
    await this.client.patch(`api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})`, { formxml: xml });

    // Publish the entity.
    await this.publishEntity(entityLogicalName);

    return { added: true };
  }

  /**
   * Remove a field from a form. Removes the entire `<row>` containing the field's control.
   * If the field is not on the form, this is a no-op.
   *
   * @param formId The systemform GUID
   * @param attributeName The logical name of the attribute to remove
   * @param entityLogicalName Used only for publishing after the change
   */
  async removeFormField(formId: string, attributeName: string, entityLogicalName: string): Promise<{ removed: boolean }> {
    const form = await this.client.get<{ formxml: string }>(
      `api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})?$select=formxml`,
    );
    const xml = form.formxml ?? '';

    const row = findFieldRow(xml, attributeName);
    if (!row) {
      return { removed: false };
    }

    const newXml = xml.substring(0, row.start) + xml.substring(row.end);
    await this.client.patch(`api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})`, { formxml: newXml });
    await this.publishEntity(entityLogicalName);

    return { removed: true };
  }

  /**
   * Add a tab showing an HTML web resource as the form's last tab; run again, the tab (found by name) is replaced, so a
   * change of height or web resource applies. The form is published; it joins a solution only when one is given.
   */
  async addWebResourceTab(
    formId: string,
    entityLogicalName: string,
    options: WebResourceTabOptions,
  ): Promise<{ added: boolean; tabName: string; formName: string; formxml: string; saved: boolean }> {
    const label = options.label.trim();
    if (!label) throw new Error('The tab needs a label.');
    const tabName = options.tabName ?? `tab_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabName)) throw new Error(`The tab name must be an identifier (got '${tabName}').`);
    const rows = options.rows ?? 40;
    if (!Number.isInteger(rows) || rows < 1 || rows > 200) throw new Error(`Rows must be a whole number from 1 to 200 (got ${rows}).`);

    const form = await this.client.get<{ formxml: string; objecttypecode: string; name: string }>(
      `api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})?$select=formxml,objecttypecode,name`,
    );
    if (form.objecttypecode !== entityLogicalName) {
      throw new Error(`Form ${formId} belongs to '${form.objecttypecode}', not '${entityLogicalName}'.`);
    }
    const resources = await this.client.get<ApiCollectionResponse<{ name: string; webresourcetype: number }>>(
      `api/data/v9.2/webresourceset?$select=name,webresourcetype&$filter=name eq ${odataString(options.webResource)}`,
    );
    const resource = (resources.value ?? []).find((w) => w.name.toLowerCase() === options.webResource.toLowerCase());
    if (!resource) throw new Error(`Web resource '${options.webResource}' was not found (or is not published).`);
    if (resource.webresourcetype !== 1) throw new Error(`Web resource '${options.webResource}' is not an HTML page (type ${resource.webresourcetype}).`);

    const languageCode = options.languageCode ?? (await this.client.get<ApiCollectionResponse<{ languagecode: number }>>(
      'api/data/v9.2/organizations?$select=languagecode')).value[0]?.languagecode ?? 1033;
    let xml = form.formxml ?? '';
    const existing = new RegExp(`<tab [^>]*name="${tabName}"[^>]*>[\\s\\S]*?</tab>`).exec(xml);
    const id = (pattern: RegExp) => (existing ? pattern.exec(existing[0])?.[1] : undefined) ?? `{${randomUUID()}}`;
    const tabXml = buildWebResourceTabXml(tabName, label, options.webResource, rows, options.passParameters ?? true, languageCode, {
      tab: id(/<tab [^>]*id="([^"]+)"/),
      section: id(/<section [^>]*id="([^"]+)"/),
      cell: id(/<cell [^>]*id="([^"]+)"/),
    });
    if (existing) {
      xml = xml.slice(0, existing.index) + tabXml + xml.slice(existing.index + existing[0].length);
    } else {
      const end = xml.indexOf('</tabs>');
      if (end === -1) throw new Error('Could not find </tabs> in the formxml: the form has an unexpected structure.');
      xml = xml.slice(0, end) + tabXml + xml.slice(end);
    }

    if (!options.dryRun) {
      const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
      await this.client.patch(`api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})`, { formxml: xml }, headers);
      await this.publishEntity(entityLogicalName);
    }
    return { added: !existing, tabName, formName: form.name, formxml: xml, saved: !options.dryRun };
  }

  // ─── VIEWS ─────────────────────────────────────────────────────────────────

  /**
   * List views (saved queries) for an entity.
   * @param entityLogicalName The entity logical name
   */
  async getEntityViews(entityLogicalName: string): Promise<ViewSummary[]> {
    // returnedtypecode on savedqueries accepts the entity logical name as a string.
    const result = await this.client.get<ApiCollectionResponse<ViewSummary>>(
      `api/data/v9.2/savedqueries?$select=savedqueryid,name,querytype,isdefault,description&$filter=returnedtypecode eq ${odataString(entityLogicalName)}`,
    );
    return result.value ?? [];
  }

  /**
   * Get the columns currently in a view by parsing its layoutxml.
   */
  async getViewColumns(viewId: string): Promise<string[]> {
    const view = await this.client.get<{ layoutxml: string }>(
      `api/data/v9.2/savedqueries(${odataGuid(viewId, 'viewId')})?$select=layoutxml`,
    );
    return this.parseLayoutColumns(view.layoutxml ?? '');
  }

  /** Extract column names from <cell name="..."> elements in layoutxml. */
  private parseLayoutColumns(layoutxml: string): string[] {
    const cols: string[] = [];
    const re = /<cell\s+name="([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(layoutxml)) !== null) {
      cols.push(match[1]);
    }
    return cols;
  }

  /**
   * Add a column to a view. Appends to both layoutxml and fetchxml.
   *
   * @param viewId The savedquery GUID
   * @param attributeName The logical name of the attribute to add
   * @param width Column width in pixels (default 150)
   * @param entityLogicalName Used only for publishing
   */
  async addViewColumn(viewId: string, attributeName: string, entityLogicalName: string, width: number = 150): Promise<{ added: boolean }> {
    const view = await this.client.get<{ layoutxml: string; fetchxml: string }>(
      `api/data/v9.2/savedqueries(${odataGuid(viewId, 'viewId')})?$select=layoutxml,fetchxml`,
    );
    let layoutxml = view.layoutxml ?? '';
    let fetchxml = view.fetchxml ?? '';

    // Check if already present.
    if (layoutxml.toLowerCase().includes(`name="${attributeName.toLowerCase()}"`)) {
      return { added: false };
    }

    // Add to layoutxml: insert <cell name="..." width="..." /> before </row>
    const rowCloseIdx = layoutxml.indexOf('</row>');
    if (rowCloseIdx === -1) {
      throw new Error('Could not find </row> in layoutxml.');
    }
    layoutxml = layoutxml.substring(0, rowCloseIdx)
      + `<cell name="${attributeName}" width="${width}" />`
      + layoutxml.substring(rowCloseIdx);

    // Add to fetchxml: insert <attribute name="..." /> before </entity>
    const entityCloseIdx = fetchxml.indexOf('</entity>');
    if (entityCloseIdx === -1) {
      throw new Error('Could not find </entity> in fetchxml.');
    }
    fetchxml = fetchxml.substring(0, entityCloseIdx)
      + `<attribute name="${attributeName}" />`
      + fetchxml.substring(entityCloseIdx);

    await this.client.patch(`api/data/v9.2/savedqueries(${odataGuid(viewId, 'viewId')})`, { layoutxml, fetchxml, returnedtypecode: entityLogicalName });
    await this.publishEntity(entityLogicalName);

    return { added: true };
  }

  /**
   * Remove a column from a view.
   *
   * @param viewId The savedquery GUID
   * @param attributeName The logical name of the attribute to remove
   * @param entityLogicalName Used only for publishing
   */
  async removeViewColumn(viewId: string, attributeName: string, entityLogicalName: string): Promise<{ removed: boolean }> {
    const view = await this.client.get<{ layoutxml: string; fetchxml: string }>(
      `api/data/v9.2/savedqueries(${odataGuid(viewId, 'viewId')})?$select=layoutxml,fetchxml`,
    );
    let layoutxml = view.layoutxml ?? '';
    let fetchxml = view.fetchxml ?? '';

    // Prevent removing the last column — Dataverse rejects an empty <row>.
    const currentCols = this.parseLayoutColumns(layoutxml);
    if (currentCols.length <= 1) {
      throw new Error(`Cannot remove '${attributeName}' — it is the only column on the view. Dataverse requires at least one column.`);
    }

    const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cellRegex = new RegExp(`<cell\\s+name="${escaped}"[^/]*/\\s*>`, 'i');
    const attrRegex = new RegExp(`<attribute\\s+name="${escaped}"[^/]*/\\s*>`, 'i');

    const newLayout = layoutxml.replace(cellRegex, '');
    const newFetch = fetchxml.replace(attrRegex, '');

    if (newLayout === layoutxml && newFetch === fetchxml) {
      return { removed: false };
    }

    await this.client.patch(`api/data/v9.2/savedqueries(${odataGuid(viewId, 'viewId')})`, { layoutxml: newLayout, fetchxml: newFetch, returnedtypecode: entityLogicalName });
    await this.publishEntity(entityLogicalName);

    return { removed: true };
  }

  /**
   * Replace the entire column set of a view.
   * This is the safest way to reconfigure view columns — it rewrites both layoutxml
   * and fetchxml in one operation, preserving filters and ordering.
   *
   * @param viewId The savedquery GUID
   * @param columns Array of { name: string, width?: number } in display order
   * @param entityLogicalName Used for publishing and for fetchxml entity name
   * @param orderBy Optional attribute to sort by (default: first column ascending)
   * @param orderDescending Sort descending (default false)
   * @param findColumns Quick Find views only: replace the columns the search box matches on
   *                    (text and lookup columns, matched with `like`)
   */
  async setViewColumns(
    viewId: string,
    columns: { name: string; width?: number }[],
    entityLogicalName: string,
    orderBy?: string,
    orderDescending: boolean = false,
    findColumns?: string[],
  ): Promise<{ columns: string[]; findColumns?: string[] }> {
    if (columns.length === 0) {
      throw new Error('At least one column is required.');
    }

    // Read current view to preserve the <grid> attributes (object, jump, etc.)
    const view = await this.client.get<{ layoutxml: string; fetchxml: string; querytype: number }>(
      `api/data/v9.2/savedqueries(${odataGuid(viewId, 'viewId')})?$select=layoutxml,fetchxml,querytype`,
    );
    if (findColumns?.length && view.querytype !== QUICK_FIND_QUERY_TYPE) {
      throw new Error(`--find-columns only applies to Quick Find views; view ${viewId} has querytype ${view.querytype}.`);
    }
    const currentLayout = view.layoutxml ?? '';

    // Extract the <grid ...> opening tag to preserve object, jump, select, icon, preview attributes.
    const gridMatch = currentLayout.match(/<grid\s[^>]+>/i);
    const gridOpen = gridMatch ? gridMatch[0] : '<grid name="resultset" select="1" icon="1" preview="1">';

    // Extract the row id attribute (usually the entity's primary key).
    const rowIdMatch = currentLayout.match(/id="([^"]+)"/i);
    const rowId = rowIdMatch ? rowIdMatch[1] : `${entityLogicalName}id`;

    const layoutxml = buildViewLayoutXml(gridOpen, rowId, columns);

    // Build fetchxml — preserve existing filters from the current fetchxml.
    const currentFetch = view.fetchxml ?? '';

    // Extract everything between <entity ...> and </entity> that is NOT an <attribute> or <order> element.
    const entityContentMatch = currentFetch.match(/<entity\s+name="[^"]*">([\s\S]*)<\/entity>/i);
    let preservedContent = '';
    if (entityContentMatch) {
      // Remove existing <attribute> and <order> elements, keep <filter>, <link-entity>, etc.
      preservedContent = entityContentMatch[1]
        .replace(/<attribute\s+name="[^"]*"\s*\/>/gi, '')
        .replace(/<order\s[^/]*\/>/gi, '')
        .trim();
    }

    if (findColumns?.length) {
      const findFilter = buildQuickFindFilter(findColumns);
      const findRe = /<filter\b[^>]*isquickfindfields="1"[^>]*>[\s\S]*?<\/filter>/i;
      preservedContent = findRe.test(preservedContent)
        ? preservedContent.replace(findRe, () => findFilter)
        : `${preservedContent}${findFilter}`;
    }

    const fetchxml = buildViewFetchXml(entityLogicalName, columns, rowId, orderBy, orderDescending, preservedContent);

    // returnedtypecode must travel with fetchxml: Quick Find views fail with a bare
    // "An unexpected error occurred" (0x80040216) when it is left out.
    await this.client.patch(`api/data/v9.2/savedqueries(${odataGuid(viewId, 'viewId')})`, { layoutxml, fetchxml, returnedtypecode: entityLogicalName });
    await this.publishEntity(entityLogicalName);

    return { columns: columns.map(c => c.name), findColumns };
  }

  /**
   * Create a public view (querytype 0), or update the columns, sort and filter of the
   * view with the same name on the table if one exists — so re-running is safe.
   *
   * @param entityLogicalName Table the view lists
   * @param name View name
   * @param columns Columns in display order
   * @param options.state Records to include: 'active' (statecode 0, default), 'inactive' or 'all'
   * @param options.filterXml Extra FetchXML <filter> element(s), combined with the state filter
   * @param options.solutionName Unmanaged solution to add the view to
   */
  async createView(
    entityLogicalName: string,
    name: string,
    columns: { name: string; width?: number }[],
    options: {
      orderBy?: string;
      orderDescending?: boolean;
      description?: string;
      state?: 'active' | 'inactive' | 'all';
      filterXml?: string;
      solutionName?: string;
    } = {},
  ): Promise<{ savedqueryid: string; created: boolean; columns: string[] }> {
    if (columns.length === 0) {
      throw new Error('At least one column is required.');
    }
    const meta = await this.client.get<{ ObjectTypeCode: number; PrimaryIdAttribute: string; PrimaryNameAttribute: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityLogicalName)})?$select=ObjectTypeCode,PrimaryIdAttribute,PrimaryNameAttribute`,
    );

    const state = options.state ?? 'active';
    const stateFilter = state === 'all' ? '' : `<filter type="and"><condition attribute="statecode" operator="eq" value="${state === 'active' ? 0 : 1}" /></filter>`;
    const fetchxml = buildViewFetchXml(
      entityLogicalName, columns, meta.PrimaryIdAttribute, options.orderBy, options.orderDescending ?? false,
      `${stateFilter}${options.filterXml ?? ''}`,
    );
    const gridOpen = `<grid name="resultset" object="${meta.ObjectTypeCode}" jump="${meta.PrimaryNameAttribute}" select="1" icon="1" preview="1">`;
    const layoutxml = buildViewLayoutXml(gridOpen, meta.PrimaryIdAttribute, columns);

    const existing = await this.client.get<ApiCollectionResponse<{ savedqueryid: string }>>(
      `api/data/v9.2/savedqueries?$select=savedqueryid&$filter=returnedtypecode eq ${odataString(entityLogicalName)} and name eq ${odataString(name)}`,
    );
    const body = {
      name,
      ...(options.description !== undefined ? { description: options.description } : {}),
      returnedtypecode: entityLogicalName,
      fetchxml,
      layoutxml,
    };

    let savedqueryid: string;
    let created: boolean;
    if (existing.value?.length) {
      savedqueryid = existing.value[0].savedqueryid;
      await this.client.patch(`api/data/v9.2/savedqueries(${savedqueryid})`, body);
      created = false;
    } else {
      const result = await this.client.post<{ entityId?: string }>(
        'api/data/v9.2/savedqueries',
        { ...body, querytype: 0 },
        options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined,
      );
      if (!result?.entityId) throw new Error('Dataverse did not return the new view id.');
      savedqueryid = result.entityId;
      created = true;
    }

    if (options.solutionName) {
      // Component type 26 = savedquery. A no-op when the view is already in the solution.
      await this.client.post('api/data/v9.2/AddSolutionComponent', {
        ComponentId: savedqueryid,
        ComponentType: 26,
        SolutionUniqueName: options.solutionName,
        AddRequiredComponents: false,
      });
    }

    await this.publishEntity(entityLogicalName);
    return { savedqueryid, created, columns: columns.map(c => c.name) };
  }

  // ─── FORM LAYOUT ───────────────────────────────────────────────────────────

  /**
   * Replace a form's tabs (and header, when the spec has one) with a declarative layout.
   * Labels default to the attributes' display names and controls get the classid for
   * each attribute type. Everything else in the formxml (events, libraries, navigation,
   * footer) is kept.
   *
   * @param formId The systemform GUID
   * @param entityLogicalName The form's table; checked against the form
   * @param spec The layout to apply
   * @param dryRun Build and return the formxml without saving it
   */
  async setFormLayout(
    formId: string,
    entityLogicalName: string,
    spec: FormLayoutSpec,
    dryRun = false,
  ): Promise<FormLayoutResult & { formName: string; notOnForm: string[]; saved: boolean }> {
    const form = await this.client.get<{ formxml: string; objecttypecode: string; name: string }>(
      `api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})?$select=formxml,objecttypecode,name`,
    );
    if (form.objecttypecode !== entityLogicalName) {
      throw new Error(`Form ${formId} belongs to '${form.objecttypecode}', not '${entityLogicalName}'.`);
    }

    const attrs = await this.client.get<ApiCollectionResponse<{
      LogicalName: string;
      AttributeType: string;
      AttributeTypeName?: { Value: string };
      AttributeOf?: string | null;
      IsCustomAttribute?: boolean;
      IsValidForForm?: boolean;
      DisplayName?: { UserLocalizedLabel?: { Label: string } | null };
    }>>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityLogicalName)})/Attributes?$select=LogicalName,AttributeType,AttributeTypeName,AttributeOf,IsCustomAttribute,IsValidForForm,DisplayName`,
    );
    const formAttrs = (attrs.value ?? []).filter(a => a.IsValidForForm !== false && !a.AttributeOf);
    const attributes = new Map<string, FormAttributeInfo>(formAttrs.map(a => [a.LogicalName, {
      logicalName: a.LogicalName,
      attributeType: a.AttributeType,
      attributeTypeName: a.AttributeTypeName?.Value,
      displayName: a.DisplayName?.UserLocalizedLabel?.Label,
    }]));

    const result = buildFormXml(form.formxml ?? '', spec, attributes, formId.toLowerCase());

    // Custom columns left off the form break the "every column is on the form" rule; report them.
    const placed = new Set([...result.fields, ...(result.headerFields ?? [])]);
    const notOnForm = formAttrs
      .filter(a => a.IsCustomAttribute && !placed.has(a.LogicalName))
      .map(a => a.LogicalName)
      .sort();

    if (!dryRun) {
      await this.client.patch(`api/data/v9.2/systemforms(${odataGuid(formId, 'formId')})`, { formxml: result.formxml });
      await this.publishEntity(entityLogicalName);
    }
    return { ...result, formName: form.name, notOnForm, saved: !dryRun };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async publishEntity(entityLogicalName: string): Promise<void> {
    await this.client.post(
      'api/data/v9.2/PublishXml',
      { ParameterXml: `<importexportxml><entities><entity>${entityLogicalName}</entity></entities></importexportxml>` },
    );
  }
}
