import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';
import { randomUUID } from 'crypto';

/** Standard classid for a generic form control (works for text, money, picklist, lookup, etc.) */
const STANDARD_CONTROL_CLASSID = '{4273EDBD-AC1D-40d3-9FB2-095C621B552D}';

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

    await this.client.patch(`api/data/v9.2/savedqueries(${viewId})`, { layoutxml, fetchxml });
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

    await this.client.patch(`api/data/v9.2/savedqueries(${viewId})`, { layoutxml: newLayout, fetchxml: newFetch });
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
   */
  async setViewColumns(
    viewId: string,
    columns: { name: string; width?: number }[],
    entityLogicalName: string,
    orderBy?: string,
    orderDescending: boolean = false,
  ): Promise<{ columns: string[] }> {
    if (columns.length === 0) {
      throw new Error('At least one column is required.');
    }

    // Read current view to preserve the <grid> attributes (object, jump, etc.)
    const view = await this.client.get<{ layoutxml: string; fetchxml: string }>(
      `api/data/v9.2/savedqueries(${viewId})?$select=layoutxml,fetchxml`,
    );
    const currentLayout = view.layoutxml ?? '';

    // Extract the <grid ...> opening tag to preserve object, jump, select, icon, preview attributes.
    const gridMatch = currentLayout.match(/<grid\s[^>]+>/i);
    const gridOpen = gridMatch ? gridMatch[0] : '<grid name="resultset" select="1" icon="1" preview="1">';

    // Extract the row id attribute (usually the entity's primary key).
    const rowIdMatch = currentLayout.match(/id="([^"]+)"/i);
    const rowId = rowIdMatch ? rowIdMatch[1] : `${entityLogicalName}id`;

    // Build layoutxml
    const cells = columns.map(c => `<cell name="${c.name}" width="${c.width ?? 150}" />`).join('');
    const layoutxml = `${gridOpen}<row name="result" id="${rowId}">${cells}</row></grid>`;

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

    const attrs = columns.map(c => `<attribute name="${c.name}" />`).join('');
    const pkAttr = `<attribute name="${rowId}" />`;
    const sortAttr = orderBy ?? columns[0].name;
    const order = `<order attribute="${sortAttr}" descending="${orderDescending}" />`;
    const fetchxml = `<fetch version="1.0" output-format="xml-platform" mapping="logical"><entity name="${entityLogicalName}">${attrs}${pkAttr}${order}${preservedContent ? preservedContent : ''}</entity></fetch>`;

    await this.client.patch(`api/data/v9.2/savedqueries(${viewId})`, { layoutxml, fetchxml });
    await this.publishEntity(entityLogicalName);

    return { columns: columns.map(c => c.name) };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async publishEntity(entityLogicalName: string): Promise<void> {
    await this.client.post(
      'api/data/v9.2/PublishXml',
      { ParameterXml: `<importexportxml><entities><entity>${entityLogicalName}</entity></entities></importexportxml>` },
    );
  }
}
