import { PowerPlatformClient } from '../PowerPlatformClient.js';
import type {
  CreateTableDefinition,
  UpdateTableDefinition,
  CreateColumnDefinition,
  OneToManyRelationshipDefinition,
  ManyToManyRelationshipDefinition,
  GlobalOptionSetDefinition,
  InsertOptionValueRequest,
  UpdateOptionValueRequest,
  Label,
  createLabel
} from '../models/CustomizationTypes.js';

/**
 * Service for Dataverse customization operations.
 * Handles table, column, relationship, and option set management.
 */
export class CustomizationService {
  constructor(private client: PowerPlatformClient) {}

  // ============================================================================
  // Table Operations
  // ============================================================================

  /**
   * Create a new custom table (entity)
   * @param definition The table definition including primary name attribute
   * @param solutionUniqueName Optional solution to add the table to
   */
  async createTable(
    definition: CreateTableDefinition,
    solutionUniqueName?: string
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.client.post<{ MetadataId: string }>(
      'api/data/v9.2/EntityDefinitions',
      definition,
      headers
    );

    return response.MetadataId;
  }

  /**
   * Update an existing table's properties
   * @param logicalName The logical name of the table
   * @param definition The properties to update
   * @param mergeLabels Whether to merge labels (preserve existing translations)
   */
  async updateTable(
    logicalName: string,
    definition: UpdateTableDefinition,
    mergeLabels: boolean = true
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (mergeLabels) {
      headers['MSCRM.MergeLabels'] = 'true';
    }

    // First get the full entity metadata
    const existing = await this.client.get<any>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')`
    );

    // Merge updates into existing definition
    const updated = { ...existing, ...definition };

    await this.client.put(
      `api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')`,
      updated,
      headers
    );
  }

  /**
   * Delete a custom table
   * @param logicalName The logical name of the table to delete
   */
  async deleteTable(logicalName: string): Promise<void> {
    await this.client.delete(
      `api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')`
    );
  }

  // ============================================================================
  // Column Operations
  // ============================================================================

  /**
   * Create a new column (attribute) on a table
   * @param entityLogicalName The logical name of the table
   * @param definition The column definition
   * @param solutionUniqueName Optional solution to add the column to
   */
  async createColumn(
    entityLogicalName: string,
    definition: CreateColumnDefinition,
    solutionUniqueName?: string
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.client.post<{ AttributeId: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
      definition,
      headers
    );

    return response.AttributeId;
  }

  /**
   * Update an existing column's properties
   * @param entityLogicalName The logical name of the table
   * @param columnLogicalName The logical name of the column
   * @param definition The properties to update
   * @param mergeLabels Whether to merge labels
   */
  async updateColumn(
    entityLogicalName: string,
    columnLogicalName: string,
    definition: Partial<CreateColumnDefinition>,
    mergeLabels: boolean = true
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (mergeLabels) {
      headers['MSCRM.MergeLabels'] = 'true';
    }

    // First get the full attribute metadata
    const existing = await this.client.get<any>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${columnLogicalName}')`
    );

    // Merge updates into existing definition
    const updated = { ...existing, ...definition };

    await this.client.put(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${columnLogicalName}')`,
      updated,
      headers
    );
  }

  /**
   * Delete a column from a table
   * @param entityLogicalName The logical name of the table
   * @param columnLogicalName The logical name of the column to delete
   */
  async deleteColumn(
    entityLogicalName: string,
    columnLogicalName: string
  ): Promise<void> {
    await this.client.delete(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${columnLogicalName}')`
    );
  }

  // ============================================================================
  // Relationship Operations
  // ============================================================================

  /**
   * Create a one-to-many relationship
   * @param definition The relationship definition
   * @param solutionUniqueName Optional solution to add the relationship to
   */
  async createOneToManyRelationship(
    definition: OneToManyRelationshipDefinition,
    solutionUniqueName?: string
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.client.post<{ MetadataId: string }>(
      'api/data/v9.2/RelationshipDefinitions',
      definition,
      headers
    );

    return response.MetadataId;
  }

  /**
   * Create a many-to-many relationship
   * @param definition The relationship definition
   * @param solutionUniqueName Optional solution to add the relationship to
   */
  async createManyToManyRelationship(
    definition: ManyToManyRelationshipDefinition,
    solutionUniqueName?: string
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.client.post<{ MetadataId: string }>(
      'api/data/v9.2/RelationshipDefinitions',
      definition,
      headers
    );

    return response.MetadataId;
  }

  /**
   * Update an existing relationship
   * @param schemaName The schema name of the relationship
   * @param definition The properties to update
   * @param mergeLabels Whether to merge labels
   */
  async updateRelationship(
    schemaName: string,
    definition: Partial<OneToManyRelationshipDefinition | ManyToManyRelationshipDefinition>,
    mergeLabels: boolean = true
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (mergeLabels) {
      headers['MSCRM.MergeLabels'] = 'true';
    }

    // First get the full relationship metadata
    const existing = await this.client.get<any>(
      `api/data/v9.2/RelationshipDefinitions(SchemaName='${schemaName}')`
    );

    // Merge updates into existing definition
    const updated = { ...existing, ...definition };

    await this.client.put(
      `api/data/v9.2/RelationshipDefinitions(SchemaName='${schemaName}')`,
      updated,
      headers
    );
  }

  /**
   * Delete a relationship
   * @param schemaName The schema name of the relationship to delete
   */
  async deleteRelationship(schemaName: string): Promise<void> {
    await this.client.delete(
      `api/data/v9.2/RelationshipDefinitions(SchemaName='${schemaName}')`
    );
  }

  // ============================================================================
  // Global Option Set Operations
  // ============================================================================

  /**
   * Create a new global option set
   * @param definition The option set definition
   * @param solutionUniqueName Optional solution to add the option set to
   */
  async createGlobalOptionSet(
    definition: GlobalOptionSetDefinition,
    solutionUniqueName?: string
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.client.post<{ MetadataId: string }>(
      'api/data/v9.2/GlobalOptionSetDefinitions',
      definition,
      headers
    );

    return response.MetadataId;
  }

  /**
   * Update an existing global option set
   * @param name The name of the option set
   * @param definition The properties to update
   * @param mergeLabels Whether to merge labels
   */
  async updateGlobalOptionSet(
    name: string,
    definition: Partial<GlobalOptionSetDefinition>,
    mergeLabels: boolean = true
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (mergeLabels) {
      headers['MSCRM.MergeLabels'] = 'true';
    }

    // First get the full option set metadata
    const existing = await this.client.get<any>(
      `api/data/v9.2/GlobalOptionSetDefinitions(Name='${name}')`
    );

    // Merge updates into existing definition
    const updated = { ...existing, ...definition };

    await this.client.put(
      `api/data/v9.2/GlobalOptionSetDefinitions(Name='${name}')`,
      updated,
      headers
    );
  }

  /**
   * Delete a global option set
   * @param name The name of the option set to delete
   */
  async deleteGlobalOptionSet(name: string): Promise<void> {
    await this.client.delete(
      `api/data/v9.2/GlobalOptionSetDefinitions(Name='${name}')`
    );
  }

  /**
   * Insert a new option value into a global option set
   * @param optionSetName The name of the option set
   * @param label The label for the new option
   * @param value Optional specific value (auto-generated if not provided)
   * @param description Optional description
   * @param solutionUniqueName Optional solution context
   */
  async insertOptionValue(
    optionSetName: string,
    label: Label,
    value?: number,
    description?: Label,
    solutionUniqueName?: string
  ): Promise<number> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const request: any = {
      OptionSetName: optionSetName,
      Label: label
    };

    if (value !== undefined) {
      request.Value = value;
    }
    if (description) {
      request.Description = description;
    }

    const response = await this.client.post<{ NewOptionValue: number }>(
      'api/data/v9.2/InsertOptionValue',
      request,
      headers
    );

    return response.NewOptionValue;
  }

  /**
   * Update an option value's label in a global option set
   * @param optionSetName The name of the option set
   * @param value The value of the option to update
   * @param label The new label
   * @param description Optional new description
   * @param mergeLabels Whether to merge labels
   */
  async updateOptionValue(
    optionSetName: string,
    value: number,
    label: Label,
    description?: Label,
    mergeLabels: boolean = true
  ): Promise<void> {
    const request: any = {
      OptionSetName: optionSetName,
      Value: value,
      Label: label,
      MergeLabels: mergeLabels
    };

    if (description) {
      request.Description = description;
    }

    await this.client.post(
      'api/data/v9.2/UpdateOptionValue',
      request
    );
  }

  /**
   * Delete an option value from a global option set
   * @param optionSetName The name of the option set
   * @param value The value of the option to delete
   */
  async deleteOptionValue(
    optionSetName: string,
    value: number
  ): Promise<void> {
    await this.client.post(
      'api/data/v9.2/DeleteOptionValue',
      {
        OptionSetName: optionSetName,
        Value: value
      }
    );
  }

  /**
   * Reorder options in a global option set
   * @param optionSetName The name of the option set
   * @param values The option values in the desired order
   */
  async orderOptions(
    optionSetName: string,
    values: number[]
  ): Promise<void> {
    await this.client.post(
      'api/data/v9.2/OrderOption',
      {
        OptionSetName: optionSetName,
        Values: values
      }
    );
  }

  // ============================================================================
  // Publishing Operations
  // ============================================================================

  /**
   * Publish customizations for a specific entity
   * @param entityLogicalName The logical name of the entity to publish
   */
  async publishEntity(entityLogicalName: string): Promise<void> {
    const parameterXml = `<importexportxml><entities><entity>${entityLogicalName}</entity></entities></importexportxml>`;

    await this.client.post(
      'api/data/v9.2/PublishXml',
      { ParameterXml: parameterXml }
    );
  }

  /**
   * Publish all pending customizations
   */
  async publishAll(): Promise<void> {
    await this.client.post('api/data/v9.2/PublishAllXml', {});
  }

  /**
   * Publish customizations for specific components
   * @param components Object containing arrays of component names to publish
   */
  async publishComponents(components: {
    entities?: string[];
    optionSets?: string[];
    webResources?: string[];
    siteMapIds?: string[];
  }): Promise<void> {
    let xml = '<importexportxml>';

    if (components.entities && components.entities.length > 0) {
      xml += '<entities>';
      for (const entity of components.entities) {
        xml += `<entity>${entity}</entity>`;
      }
      xml += '</entities>';
    }

    if (components.optionSets && components.optionSets.length > 0) {
      xml += '<optionsets>';
      for (const optionSet of components.optionSets) {
        xml += `<optionset>${optionSet}</optionset>`;
      }
      xml += '</optionsets>';
    }

    if (components.webResources && components.webResources.length > 0) {
      xml += '<webresources>';
      for (const webResource of components.webResources) {
        xml += `<webresource>{${webResource}}</webresource>`;
      }
      xml += '</webresources>';
    }

    if (components.siteMapIds && components.siteMapIds.length > 0) {
      xml += '<sitemaps>';
      for (const siteMapId of components.siteMapIds) {
        xml += `<sitemap>{${siteMapId}}</sitemap>`;
      }
      xml += '</sitemaps>';
    }

    xml += '</importexportxml>';

    await this.client.post(
      'api/data/v9.2/PublishXml',
      { ParameterXml: xml }
    );
  }
}
