import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';
import { randomUUID } from 'crypto';
import { buildFormXml } from './form-layout.js';
import type { FormAttributeInfo, FormLayoutResult, FormLayoutSpec } from './form-layout.js';

/** Standard classid for a generic form control (works for text, money, picklist, lookup, etc.) */
const STANDARD_CONTROL_CLASSID = '{4273EDBD-AC1D-40d3-9FB2-095C621B552D}';

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
    let filter = `objecttypecode eq '${entityLogicalName}'`;
    if (type !== undefined) filter += ` and type eq ${type}`;

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
      `api/data/v9.2/systemforms(${formId})?$select=formxml`,
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
   * Add a field to a form. Appends a new row/cell/control at the end of the first
   * section in the first tab. If the field is already present, this is a no-op.
   *
   * @param formId The systemform GUID
   * @param attributeName The logical name of the attribute to add
   * @param entityLogicalName Used only for publishing after the change
   */
  async addFormField(formId: string, attributeName: string, entityLogicalName: string): Promise<{ added: boolean }> {
    const form = await this.client.get<{ formxml: string }>(
      `api/data/v9.2/systemforms(${formId})?$select=formxml`,
    );
    let xml = form.formxml ?? '';

    // Check if the field is already on the form.
    if (xml.toLowerCase().includes(`datafieldname="${attributeName.toLowerCase()}"`)) {
      return { added: false };
    }

    // Build the new row element.
    const cellId = `{${randomUUID()}}`;
    const newRow = `<row><cell id="${cellId}" showlabel="true" locklevel="0"><labels><label description="${attributeName}" languagecode="1033" /></labels><control id="${attributeName}" classid="${STANDARD_CONTROL_CLASSID}" datafieldname="${attributeName}" /></cell></row>`;

    // Insert before the closing </rows> of the first section.
    const rowsCloseIdx = xml.indexOf('</rows>');
    if (rowsCloseIdx === -1) {
      throw new Error('Could not find </rows> in formxml — form may have an unexpected structure.');
    }
    xml = xml.substring(0, rowsCloseIdx) + newRow + xml.substring(rowsCloseIdx);

    // Patch the form.
    await this.client.patch(`api/data/v9.2/systemforms(${formId})`, { formxml: xml });

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
      `api/data/v9.2/systemforms(${formId})?$select=formxml`,
    );
    let xml = form.formxml ?? '';

    // Build a regex that matches the <row> containing the target control.
    // Use a non-greedy match between <row> and </row> to avoid over-matching.
    const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRegex = new RegExp(`<row>[\\s\\S]*?datafieldname="${escaped}"[\\s\\S]*?<\\/row>`, 'i');
    const newXml = xml.replace(rowRegex, '');

    if (newXml === xml) {
      return { removed: false };
    }

    await this.client.patch(`api/data/v9.2/systemforms(${formId})`, { formxml: newXml });
    await this.publishEntity(entityLogicalName);

    return { removed: true };
  }

  // ─── VIEWS ─────────────────────────────────────────────────────────────────

  /**
   * List views (saved queries) for an entity.
   * @param entityLogicalName The entity logical name
   */
  async getEntityViews(entityLogicalName: string): Promise<ViewSummary[]> {
    // returnedtypecode on savedqueries accepts the entity logical name as a string.
    const result = await this.client.get<ApiCollectionResponse<ViewSummary>>(
      `api/data/v9.2/savedqueries?$select=savedqueryid,name,querytype,isdefault,description&$filter=returnedtypecode eq '${entityLogicalName}'`,
    );
    return result.value ?? [];
  }

  /**
   * Get the columns currently in a view by parsing its layoutxml.
   */
  async getViewColumns(viewId: string): Promise<string[]> {
    const view = await this.client.get<{ layoutxml: string }>(
      `api/data/v9.2/savedqueries(${viewId})?$select=layoutxml`,
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
      `api/data/v9.2/savedqueries(${viewId})?$select=layoutxml,fetchxml`,
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

    await this.client.patch(`api/data/v9.2/savedqueries(${viewId})`, { layoutxml, fetchxml, returnedtypecode: entityLogicalName });
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
      `api/data/v9.2/savedqueries(${viewId})?$select=layoutxml,fetchxml`,
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

    await this.client.patch(`api/data/v9.2/savedqueries(${viewId})`, { layoutxml: newLayout, fetchxml: newFetch, returnedtypecode: entityLogicalName });
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
      `api/data/v9.2/savedqueries(${viewId})?$select=layoutxml,fetchxml,querytype`,
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
    await this.client.patch(`api/data/v9.2/savedqueries(${viewId})`, { layoutxml, fetchxml, returnedtypecode: entityLogicalName });
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
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=ObjectTypeCode,PrimaryIdAttribute,PrimaryNameAttribute`,
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
      `api/data/v9.2/savedqueries?$select=savedqueryid&$filter=returnedtypecode eq '${entityLogicalName}' and name eq '${name.replace(/'/g, "''")}'`,
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
      `api/data/v9.2/systemforms(${formId})?$select=formxml,objecttypecode,name`,
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
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,AttributeType,AttributeTypeName,AttributeOf,IsCustomAttribute,IsValidForForm,DisplayName`,
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
      await this.client.patch(`api/data/v9.2/systemforms(${formId})`, { formxml: result.formxml });
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
