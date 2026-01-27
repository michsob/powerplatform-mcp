import { PowerPlatformClient } from '../PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../models/ApiCollectionResponse.js';
import type {
  SystemForm,
  FormQueryOptions,
  FormUpdateDefinition,
  TabDefinition,
  SectionDefinition,
  ControlDefinition,
  ParsedForm,
} from '../models/FormTypes.js';
import {
  parseFormXml,
  addTab as xmlAddTab,
  removeTab as xmlRemoveTab,
  addSection as xmlAddSection,
  removeSection as xmlRemoveSection,
  addControl as xmlAddControl,
  removeControl as xmlRemoveControl,
  getFormStructureSummary,
} from '../utils/FormXmlParser.js';

/**
 * Service for managing Dataverse forms (SystemForm entity).
 * Provides operations for reading, creating, updating, and manipulating forms.
 */
export class FormService {
  constructor(private client: PowerPlatformClient) {}

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get all forms for an entity
   * @param entityLogicalName The logical name of the entity
   * @param formType Optional form type filter (2=Main, 6=QuickView, 7=QuickCreate, etc.)
   */
  async getEntityForms(entityLogicalName: string, formType?: number): Promise<SystemForm[]> {
    let filter = `objecttypecode eq '${entityLogicalName}'`;
    if (formType !== undefined) {
      filter += ` and type eq ${formType}`;
    }

    const response = await this.client.get<ApiCollectionResponse<SystemForm>>(
      `api/data/v9.2/systemforms?$filter=${encodeURIComponent(filter)}&$orderby=name`
    );

    return response.value;
  }

  /**
   * Get a specific form by ID
   * @param formId The form's unique identifier
   */
  async getForm(formId: string): Promise<SystemForm> {
    // Remove braces if present
    const cleanId = formId.replace(/[{}]/g, '');

    return await this.client.get<SystemForm>(
      `api/data/v9.2/systemforms(${cleanId})`
    );
  }

  /**
   * Get a specific form by ID (unpublished version)
   * @param formId The form's unique identifier
   */
  async getFormUnpublished(formId: string): Promise<SystemForm> {
    // Remove braces if present
    const cleanId = formId.replace(/[{}]/g, '');

    // Use RetrieveUnpublished action to get unpublished changes
    const response = await this.client.post<SystemForm>(
      'api/data/v9.2/RetrieveUnpublished',
      {
        Target: {
          '@odata.type': 'Microsoft.Dynamics.CRM.systemform',
          formid: cleanId
        }
      }
    );

    return response;
  }

  /**
   * Query forms with various filter options
   * @param options Query options for filtering forms
   */
  async queryForms(options: FormQueryOptions): Promise<SystemForm[]> {
    const filters: string[] = [];

    if (options.entityLogicalName) {
      filters.push(`objecttypecode eq '${options.entityLogicalName}'`);
    }
    if (options.formType !== undefined) {
      filters.push(`type eq ${options.formType}`);
    }
    if (options.isDefault !== undefined) {
      filters.push(`isdefault eq ${options.isDefault}`);
    }
    if (options.isActive !== undefined) {
      const state = options.isActive ? 1 : 0;
      filters.push(`formactivationstate eq ${state}`);
    }
    if (options.nameContains) {
      filters.push(`contains(name, '${options.nameContains}')`);
    }

    let url = 'api/data/v9.2/systemforms?$orderby=name';
    if (filters.length > 0) {
      url += `&$filter=${encodeURIComponent(filters.join(' and '))}`;
    }

    const maxRecords = options.maxRecords || 50;
    url += `&$top=${maxRecords}`;

    const response = await this.client.get<ApiCollectionResponse<SystemForm>>(url);
    return response.value;
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Copy an existing form to create a new one
   * @param sourceFormId The ID of the form to copy
   * @param newName The name for the new form
   * @param solutionUniqueName Optional solution to add the form to
   */
  async copyForm(sourceFormId: string, newName: string, solutionUniqueName?: string): Promise<string> {
    const cleanId = sourceFormId.replace(/[{}]/g, '');

    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.client.post<{ FormId: string }>(
      'api/data/v9.2/CopySystemForm',
      {
        Target: {
          formid: cleanId,
          '@odata.type': 'Microsoft.Dynamics.CRM.systemform'
        },
        NewFormName: newName
      },
      headers
    );

    return response.FormId;
  }

  /**
   * Update form metadata (name, description)
   * @param formId The form's unique identifier
   * @param updates The properties to update
   */
  async updateForm(formId: string, updates: FormUpdateDefinition): Promise<void> {
    const cleanId = formId.replace(/[{}]/g, '');

    const body: Record<string, string> = {};
    if (updates.name !== undefined) {
      body.name = updates.name;
    }
    if (updates.description !== undefined) {
      body.description = updates.description;
    }

    await this.client.patch(
      `api/data/v9.2/systemforms(${cleanId})`,
      body
    );
  }

  /**
   * Update form XML directly
   * @param formId The form's unique identifier
   * @param formXml The new FormXML content
   * @param solutionUniqueName Optional solution context
   */
  async updateFormXml(formId: string, formXml: string, solutionUniqueName?: string): Promise<void> {
    const cleanId = formId.replace(/[{}]/g, '');

    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    // Use PATCH to update formxml property
    await this.client.patch(
      `api/data/v9.2/systemforms(${cleanId})`,
      { formxml: formXml },
      headers
    );
  }

  /**
   * Delete a form
   * @param formId The form's unique identifier
   */
  async deleteForm(formId: string): Promise<void> {
    const cleanId = formId.replace(/[{}]/g, '');
    await this.client.delete(`api/data/v9.2/systemforms(${cleanId})`);
  }

  /**
   * Set a form as the default for its entity
   * @param formId The form's unique identifier
   */
  async setDefaultForm(formId: string): Promise<void> {
    const cleanId = formId.replace(/[{}]/g, '');

    await this.client.patch(
      `api/data/v9.2/systemforms(${cleanId})`,
      { isdefault: true }
    );
  }

  /**
   * Activate or deactivate a form
   * @param formId The form's unique identifier
   * @param active Whether to activate (true) or deactivate (false)
   */
  async setFormActivationState(formId: string, active: boolean): Promise<void> {
    const cleanId = formId.replace(/[{}]/g, '');

    await this.client.patch(
      `api/data/v9.2/systemforms(${cleanId})`,
      { formactivationstate: active ? 1 : 0 }
    );
  }

  /**
   * Publish form changes for an entity
   * @param entityLogicalName The entity whose forms should be published
   */
  async publishForm(entityLogicalName: string): Promise<void> {
    const parameterXml = `<importexportxml><entities><entity>${entityLogicalName}</entity></entities></importexportxml>`;

    await this.client.post(
      'api/data/v9.2/PublishXml',
      { ParameterXml: parameterXml }
    );
  }

  // ============================================================================
  // High-Level FormXML Manipulation
  // ============================================================================

  /**
   * Add a tab to a form
   * @param formId The form's unique identifier
   * @param definition Tab definition
   * @param position Optional position (0-indexed). Appends if not specified.
   * @param solutionUniqueName Optional solution context
   */
  async addTab(formId: string, definition: TabDefinition, position?: number, solutionUniqueName?: string, autoPublish: boolean = true): Promise<void> {
    const form = await this.getForm(formId);
    const updatedXml = xmlAddTab(form.formxml, definition, position);
    await this.updateFormXml(formId, updatedXml, solutionUniqueName);
    if (autoPublish) {
      await this.publishForm(form.objecttypecode);
    }
  }

  /**
   * Remove a tab from a form
   * @param formId The form's unique identifier
   * @param tabName The name of the tab to remove
   * @param solutionUniqueName Optional solution context
   */
  async removeTab(formId: string, tabName: string, solutionUniqueName?: string, autoPublish: boolean = true): Promise<void> {
    const form = await this.getForm(formId);
    const updatedXml = xmlRemoveTab(form.formxml, tabName);
    await this.updateFormXml(formId, updatedXml, solutionUniqueName);
    if (autoPublish) {
      await this.publishForm(form.objecttypecode);
    }
  }

  /**
   * Add a section to a tab in a form
   * @param formId The form's unique identifier
   * @param tabName The name of the tab to add the section to
   * @param definition Section definition
   * @param columnIndex The column index within the tab (default 0)
   * @param solutionUniqueName Optional solution context
   */
  async addSection(formId: string, tabName: string, definition: SectionDefinition, columnIndex?: number, solutionUniqueName?: string, autoPublish: boolean = true): Promise<void> {
    const form = await this.getForm(formId);
    const updatedXml = xmlAddSection(form.formxml, tabName, definition, columnIndex);
    await this.updateFormXml(formId, updatedXml, solutionUniqueName);
    if (autoPublish) {
      await this.publishForm(form.objecttypecode);
    }
  }

  /**
   * Remove a section from a form
   * @param formId The form's unique identifier
   * @param sectionName The name of the section to remove
   * @param solutionUniqueName Optional solution context
   */
  async removeSection(formId: string, sectionName: string, solutionUniqueName?: string, autoPublish: boolean = true): Promise<void> {
    const form = await this.getForm(formId);
    const updatedXml = xmlRemoveSection(form.formxml, sectionName);
    await this.updateFormXml(formId, updatedXml, solutionUniqueName);
    if (autoPublish) {
      await this.publishForm(form.objecttypecode);
    }
  }

  /**
   * Add a field/control to a section in a form
   * @param formId The form's unique identifier
   * @param sectionName The name of the section to add the field to
   * @param definition Control/field definition
   * @param solutionUniqueName Optional solution context
   * @param autoPublish Whether to auto-publish changes (default true)
   */
  async addField(formId: string, sectionName: string, definition: ControlDefinition, solutionUniqueName?: string, autoPublish: boolean = true): Promise<void> {
    const form = await this.getForm(formId);
    const updatedXml = xmlAddControl(form.formxml, sectionName, definition);
    await this.updateFormXml(formId, updatedXml, solutionUniqueName);

    // Auto-publish to make changes visible
    if (autoPublish) {
      await this.publishForm(form.objecttypecode);
    }
  }

  /**
   * Remove a field/control from a form
   * @param formId The form's unique identifier
   * @param fieldName The field name (datafieldname) of the control to remove
   * @param solutionUniqueName Optional solution context
   */
  async removeField(formId: string, fieldName: string, solutionUniqueName?: string, autoPublish: boolean = true): Promise<void> {
    const form = await this.getForm(formId);
    const updatedXml = xmlRemoveControl(form.formxml, fieldName);
    await this.updateFormXml(formId, updatedXml, solutionUniqueName);
    if (autoPublish) {
      await this.publishForm(form.objecttypecode);
    }
  }

  // ============================================================================
  // Debug/Test Methods
  // ============================================================================

  /**
   * Debug method to test formxml PATCH behavior
   */
  async testFormXmlPatch(formId: string): Promise<{ beforeLen: number; modifiedLen: number; afterLen: number; afterPublishLen: number; changeApplied: boolean; changeAppliedAfterPublish: boolean }> {
    const cleanId = formId.replace(/[{}]/g, '');

    // Get current form
    const formBefore = await this.getForm(cleanId);
    const xmlBefore = formBefore.formxml;
    const entityName = formBefore.objecttypecode;

    console.error(`[TEST] Current formxml length: ${xmlBefore.length}`);
    console.error(`[TEST] Entity: ${entityName}`);

    // Make a valid modification - add a row with a spacer cell
    // This should be valid FormXML
    const xmlModified = xmlBefore.replace(
      '</rows></section>',
      '<row><cell id="{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}" userspacer="true"><labels><label description="Spacer" languagecode="1033" /></labels></cell></row></rows></section>'
    );

    console.error(`[TEST] Modified formxml length: ${xmlModified.length}`);
    console.error(`[TEST] Contains spacer GUID: ${xmlModified.includes('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')}`);

    // PATCH with modified content
    await this.client.patch(
      `api/data/v9.2/systemforms(${cleanId})`,
      { formxml: xmlModified }
    );

    console.error(`[TEST] PATCH completed`);

    // Read back immediately
    const formAfter = await this.getForm(cleanId);
    const xmlAfter = formAfter.formxml;

    console.error(`[TEST] After PATCH formxml length: ${xmlAfter.length}`);
    console.error(`[TEST] After contains spacer: ${xmlAfter.includes('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')}`);

    // Publish and read again
    await this.publishForm(entityName);
    console.error(`[TEST] Published`);

    const formAfterPublish = await this.getForm(cleanId);
    const xmlAfterPublish = formAfterPublish.formxml;

    console.error(`[TEST] After Publish formxml length: ${xmlAfterPublish.length}`);
    console.error(`[TEST] After Publish contains spacer: ${xmlAfterPublish.includes('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')}`);

    return {
      beforeLen: xmlBefore.length,
      modifiedLen: xmlModified.length,
      afterLen: xmlAfter.length,
      afterPublishLen: xmlAfterPublish.length,
      changeApplied: xmlAfter.includes('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
      changeAppliedAfterPublish: xmlAfterPublish.includes('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    };
  }

  // ============================================================================
  // FormXML Analysis
  // ============================================================================

  /**
   * Parse a form's XML and return structured representation
   * @param formId The form's unique identifier
   */
  async parseForm(formId: string): Promise<ParsedForm> {
    const form = await this.getForm(formId);
    return parseFormXml(form.formxml);
  }

  /**
   * Get a text summary of the form structure
   * @param formId The form's unique identifier
   */
  async getFormStructure(formId: string): Promise<string> {
    const parsed = await this.parseForm(formId);
    return getFormStructureSummary(parsed);
  }
}
