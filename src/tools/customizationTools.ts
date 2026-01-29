import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServiceContext } from "../types.js";
import type {
  CreateTableDefinition,
  CreateColumnDefinition,
  StringColumnDefinition,
  IntegerColumnDefinition,
  DecimalColumnDefinition,
  BooleanColumnDefinition,
  DateTimeColumnDefinition,
  PicklistColumnDefinition,
  MemoColumnDefinition,
  OneToManyRelationshipDefinition,
  ManyToManyRelationshipDefinition,
  GlobalOptionSetDefinition,
  Label
} from "../models/CustomizationTypes.js";
import { createLabel } from "../models/CustomizationTypes.js";

/**
 * Register customization tools with the MCP server.
 */
export function registerCustomizationTools(server: McpServer, ctx: ServiceContext): void {

  // ============================================================================
  // Table Tools
  // ============================================================================

  // Create Table
  server.registerTool(
    "create-table",
    {
      title: "Create Table",
      description: "Create a new custom table (entity) in Dataverse with a primary name column",
      inputSchema: {
        schemaName: z.string().describe("The schema name for the table (e.g., 'new_project'). Must include publisher prefix."),
        displayName: z.string().describe("The display name for the table (e.g., 'Project')"),
        displayCollectionName: z.string().describe("The plural display name (e.g., 'Projects')"),
        description: z.string().optional().describe("Description of the table"),
        primaryColumnName: z.string().describe("Schema name for the primary name column (e.g., 'new_name')"),
        primaryColumnDisplayName: z.string().describe("Display name for the primary name column (e.g., 'Name')"),
        primaryColumnMaxLength: z.number().optional().default(100).describe("Max length of primary name column (default 100)"),
        ownershipType: z.enum(['UserOwned', 'OrganizationOwned']).optional().default('UserOwned').describe("Ownership type"),
        solutionUniqueName: z.string().optional().describe("Solution to add the table to"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        metadataId: z.string().optional(),
        tableName: z.string(),
      }),
    },
    async ({ schemaName, displayName, displayCollectionName, description, primaryColumnName, primaryColumnDisplayName, primaryColumnMaxLength, ownershipType, solutionUniqueName }) => {
      try {
        const service = ctx.getCustomizationService();

        const primaryColumn: StringColumnDefinition = {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: primaryColumnName,
          DisplayName: createLabel(primaryColumnDisplayName),
          MaxLength: primaryColumnMaxLength || 100,
          IsPrimaryName: true,
          RequiredLevel: { Value: 'ApplicationRequired' }
        };

        const tableDefinition: CreateTableDefinition = {
          '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
          SchemaName: schemaName,
          DisplayName: createLabel(displayName),
          DisplayCollectionName: createLabel(displayCollectionName),
          OwnershipType: ownershipType || 'UserOwned',
          HasActivities: false,
          HasNotes: false,
          IsActivity: false,
          PrimaryNameAttribute: primaryColumnName.toLowerCase(),
          Attributes: [primaryColumn]
        };

        if (description) {
          tableDefinition.Description = createLabel(description);
        }

        const metadataId = await service.createTable(tableDefinition, solutionUniqueName);

        return {
          structuredContent: { success: true, metadataId, tableName: schemaName },
          content: [
            {
              type: "text",
              text: `Successfully created table '${schemaName}' with ID ${metadataId}. Remember to publish customizations to make the table available.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating table:", error);
        return {
          structuredContent: { success: false, tableName: schemaName },
          content: [
            {
              type: "text",
              text: `Failed to create table '${schemaName}': ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Table
  server.registerTool(
    "delete-table",
    {
      title: "Delete Table",
      description: "Delete a custom table (entity) from Dataverse. WARNING: This permanently deletes all data in the table.",
      inputSchema: {
        logicalName: z.string().describe("The logical name of the table to delete (e.g., 'new_project')"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        tableName: z.string(),
      }),
    },
    async ({ logicalName }) => {
      try {
        const service = ctx.getCustomizationService();
        await service.deleteTable(logicalName);

        return {
          structuredContent: { success: true, tableName: logicalName },
          content: [
            {
              type: "text",
              text: `Successfully deleted table '${logicalName}'.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error deleting table:", error);
        return {
          structuredContent: { success: false, tableName: logicalName },
          content: [
            {
              type: "text",
              text: `Failed to delete table '${logicalName}': ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================================
  // Column Tools
  // ============================================================================

  // Consolidated Create Column Tool
  const createColumnInputSchema = z.object({
    // Common parameters
    entityLogicalName: z.string().describe("The logical name of the table"),
    schemaName: z.string().describe("The schema name for the column (e.g., 'new_fieldname')"),
    displayName: z.string().describe("The display name for the column"),
    columnType: z.enum(['String', 'Memo', 'Integer', 'Decimal', 'Boolean', 'DateTime', 'Choice']).describe("The type of column to create"),
    description: z.string().optional().describe("Description of the column"),
    requiredLevel: z.enum(['None', 'Recommended', 'ApplicationRequired']).optional().default('None').describe("Required level"),
    solutionUniqueName: z.string().optional().describe("Solution to add the column to"),

    // String/Memo parameters
    maxLength: z.number().optional().describe("Maximum text length. For String: 1-4000, default 100. For Memo: 1-1048576, default 2000."),
    stringFormat: z.enum(['Text', 'Email', 'Phone', 'Url', 'TextArea']).optional().describe("String format type (only for String columns)"),

    // Integer/Decimal parameters
    minValue: z.number().optional().describe("Minimum value (for Integer/Decimal columns)"),
    maxValue: z.number().optional().describe("Maximum value (for Integer/Decimal columns)"),
    precision: z.number().optional().describe("Number of decimal places, 0-10, default 2 (only for Decimal columns)"),

    // Boolean parameters
    trueLabel: z.string().optional().describe("Label for true value, default 'Yes' (only for Boolean columns)"),
    falseLabel: z.string().optional().describe("Label for false value, default 'No' (only for Boolean columns)"),
    defaultValue: z.boolean().optional().describe("Default value (only for Boolean columns)"),

    // DateTime parameters
    dateFormat: z.enum(['DateOnly', 'DateAndTime']).optional().describe("Date format, default 'DateAndTime' (only for DateTime columns)"),
    behavior: z.enum(['UserLocal', 'DateOnly', 'TimeZoneIndependent']).optional().describe("DateTime behavior, default 'UserLocal' (only for DateTime columns)"),

    // Choice parameters
    options: z.array(z.object({
      label: z.string().describe("Option label"),
      value: z.number().describe("Option value (unique integer)")
    })).optional().describe("Array of choice options (required for Choice columns)"),
  }).refine(
    (data) => data.columnType !== 'Choice' || (data.options && data.options.length > 0),
    { message: "Choice columns require at least one option in the 'options' array", path: ['options'] }
  );

  type CreateColumnInput = z.infer<typeof createColumnInputSchema>;

  server.registerTool(
    "create-column",
    {
      title: "Create Column",
      description: "Create a new column on a table. Supports String, Memo, Integer, Decimal, Boolean, DateTime, and Choice column types.",
      inputSchema: createColumnInputSchema,
      outputSchema: z.object({
        success: z.boolean(),
        attributeId: z.string().optional(),
        columnName: z.string(),
        columnType: z.string(),
      }),
    },
    async (input: CreateColumnInput) => {
      const { entityLogicalName, schemaName, displayName, columnType, description, requiredLevel, solutionUniqueName } = input;

      try {
        const service = ctx.getCustomizationService();
        let columnDefinition: CreateColumnDefinition;

        switch (columnType) {
          case 'String': {
            const def: StringColumnDefinition = {
              '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
              SchemaName: schemaName,
              DisplayName: createLabel(displayName),
              MaxLength: input.maxLength || 100,
              RequiredLevel: { Value: requiredLevel || 'None' }
            };
            if (description) def.Description = createLabel(description);
            if (input.stringFormat) def.FormatName = { Value: input.stringFormat };
            columnDefinition = def;
            break;
          }

          case 'Memo': {
            const def: MemoColumnDefinition = {
              '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
              SchemaName: schemaName,
              DisplayName: createLabel(displayName),
              MaxLength: input.maxLength || 2000,
              RequiredLevel: { Value: requiredLevel || 'None' }
            };
            if (description) def.Description = createLabel(description);
            columnDefinition = def;
            break;
          }

          case 'Integer': {
            const def: IntegerColumnDefinition = {
              '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
              SchemaName: schemaName,
              DisplayName: createLabel(displayName),
              RequiredLevel: { Value: requiredLevel || 'None' }
            };
            if (description) def.Description = createLabel(description);
            if (input.minValue !== undefined) def.MinValue = input.minValue;
            if (input.maxValue !== undefined) def.MaxValue = input.maxValue;
            columnDefinition = def;
            break;
          }

          case 'Decimal': {
            const def: DecimalColumnDefinition = {
              '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
              SchemaName: schemaName,
              DisplayName: createLabel(displayName),
              Precision: input.precision || 2,
              RequiredLevel: { Value: requiredLevel || 'None' }
            };
            if (description) def.Description = createLabel(description);
            if (input.minValue !== undefined) def.MinValue = input.minValue;
            if (input.maxValue !== undefined) def.MaxValue = input.maxValue;
            columnDefinition = def;
            break;
          }

          case 'Boolean': {
            const def: BooleanColumnDefinition = {
              '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
              SchemaName: schemaName,
              DisplayName: createLabel(displayName),
              RequiredLevel: { Value: requiredLevel || 'None' },
              OptionSet: {
                TrueOption: {
                  Value: 1,
                  Label: createLabel(input.trueLabel || 'Yes')
                },
                FalseOption: {
                  Value: 0,
                  Label: createLabel(input.falseLabel || 'No')
                }
              }
            };
            if (description) def.Description = createLabel(description);
            if (input.defaultValue !== undefined) def.DefaultValue = input.defaultValue;
            columnDefinition = def;
            break;
          }

          case 'DateTime': {
            const def: DateTimeColumnDefinition = {
              '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
              SchemaName: schemaName,
              DisplayName: createLabel(displayName),
              Format: input.dateFormat || 'DateAndTime',
              DateTimeBehavior: { Value: input.behavior || 'UserLocal' },
              RequiredLevel: { Value: requiredLevel || 'None' }
            };
            if (description) def.Description = createLabel(description);
            columnDefinition = def;
            break;
          }

          case 'Choice': {
            const def: PicklistColumnDefinition = {
              '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
              SchemaName: schemaName,
              DisplayName: createLabel(displayName),
              RequiredLevel: { Value: requiredLevel || 'None' },
              OptionSet: {
                '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
                IsGlobal: false,
                OptionSetType: 'Picklist',
                Options: input.options!.map(opt => ({
                  Value: opt.value,
                  Label: createLabel(opt.label)
                }))
              }
            };
            if (description) def.Description = createLabel(description);
            columnDefinition = def;
            break;
          }

          default:
            throw new Error(`Unknown column type: ${columnType}`);
        }

        const attributeId = await service.createColumn(entityLogicalName, columnDefinition, solutionUniqueName);

        const typeDescriptions: Record<string, string> = {
          'String': 'string',
          'Memo': 'memo',
          'Integer': 'integer',
          'Decimal': 'decimal',
          'Boolean': 'boolean',
          'DateTime': 'datetime',
          'Choice': `choice with ${input.options?.length || 0} options`
        };

        return {
          structuredContent: { success: true, attributeId, columnName: schemaName, columnType },
          content: [
            {
              type: "text",
              text: `Successfully created ${typeDescriptions[columnType]} column '${schemaName}' on '${entityLogicalName}'. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error(`Error creating ${columnType} column:`, error);
        return {
          structuredContent: { success: false, columnName: schemaName, columnType },
          content: [
            {
              type: "text",
              text: `Failed to create ${columnType.toLowerCase()} column: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Column
  server.registerTool(
    "delete-column",
    {
      title: "Delete Column",
      description: "Delete a column from a table. WARNING: This permanently deletes the column and its data.",
      inputSchema: {
        entityLogicalName: z.string().describe("The logical name of the table"),
        columnLogicalName: z.string().describe("The logical name of the column to delete"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        columnName: z.string(),
      }),
    },
    async ({ entityLogicalName, columnLogicalName }) => {
      try {
        const service = ctx.getCustomizationService();
        await service.deleteColumn(entityLogicalName, columnLogicalName);

        return {
          structuredContent: { success: true, columnName: columnLogicalName },
          content: [
            {
              type: "text",
              text: `Successfully deleted column '${columnLogicalName}' from '${entityLogicalName}'.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error deleting column:", error);
        return {
          structuredContent: { success: false, columnName: columnLogicalName },
          content: [
            {
              type: "text",
              text: `Failed to delete column: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================================
  // Relationship Tools
  // ============================================================================

  // Create One-to-Many Relationship
  server.registerTool(
    "create-one-to-many-relationship",
    {
      title: "Create One-to-Many Relationship",
      description: "Create a one-to-many (1:N) relationship between two tables, which also creates a lookup column on the child table",
      inputSchema: {
        schemaName: z.string().describe("Schema name for the relationship (e.g., 'new_account_project')"),
        parentEntityLogicalName: z.string().describe("Logical name of the parent (one) table"),
        parentEntityPrimaryKey: z.string().describe("Primary key attribute of parent (usually entityid like 'accountid')"),
        childEntityLogicalName: z.string().describe("Logical name of the child (many) table"),
        lookupSchemaName: z.string().describe("Schema name for the lookup column on child table"),
        lookupDisplayName: z.string().describe("Display name for the lookup column"),
        cascadeDelete: z.enum(['NoCascade', 'Cascade', 'RemoveLink', 'Restrict']).optional().default('RemoveLink').describe("Delete behavior"),
        solutionUniqueName: z.string().optional().describe("Solution to add the relationship to"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        metadataId: z.string().optional(),
        relationshipName: z.string(),
      }),
    },
    async ({ schemaName, parentEntityLogicalName, parentEntityPrimaryKey, childEntityLogicalName, lookupSchemaName, lookupDisplayName, cascadeDelete, solutionUniqueName }) => {
      try {
        const service = ctx.getCustomizationService();

        const definition: OneToManyRelationshipDefinition = {
          '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
          SchemaName: schemaName,
          ReferencedEntity: parentEntityLogicalName,
          ReferencedAttribute: parentEntityPrimaryKey,
          ReferencingEntity: childEntityLogicalName,
          CascadeConfiguration: {
            Assign: 'NoCascade',
            Delete: cascadeDelete || 'RemoveLink',
            Merge: 'NoCascade',
            Reparent: 'NoCascade',
            Share: 'NoCascade',
            Unshare: 'NoCascade'
          },
          Lookup: {
            '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
            SchemaName: lookupSchemaName,
            DisplayName: createLabel(lookupDisplayName),
            RequiredLevel: { Value: 'None' }
          }
        };

        const metadataId = await service.createOneToManyRelationship(definition, solutionUniqueName);

        return {
          structuredContent: { success: true, metadataId, relationshipName: schemaName },
          content: [
            {
              type: "text",
              text: `Successfully created 1:N relationship '${schemaName}' from '${parentEntityLogicalName}' to '${childEntityLogicalName}'. Lookup column '${lookupSchemaName}' was created on the child table. Remember to publish both entities.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating relationship:", error);
        return {
          structuredContent: { success: false, relationshipName: schemaName },
          content: [
            {
              type: "text",
              text: `Failed to create relationship: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Create Many-to-Many Relationship
  server.registerTool(
    "create-many-to-many-relationship",
    {
      title: "Create Many-to-Many Relationship",
      description: "Create a many-to-many (N:N) relationship between two tables",
      inputSchema: {
        schemaName: z.string().describe("Schema name for the relationship (e.g., 'new_account_contact')"),
        entity1LogicalName: z.string().describe("Logical name of the first table"),
        entity2LogicalName: z.string().describe("Logical name of the second table"),
        intersectEntityName: z.string().optional().describe("Optional custom name for the intersect table"),
        solutionUniqueName: z.string().optional().describe("Solution to add the relationship to"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        metadataId: z.string().optional(),
        relationshipName: z.string(),
      }),
    },
    async ({ schemaName, entity1LogicalName, entity2LogicalName, intersectEntityName, solutionUniqueName }) => {
      try {
        const service = ctx.getCustomizationService();

        const definition: ManyToManyRelationshipDefinition = {
          '@odata.type': 'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata',
          SchemaName: schemaName,
          Entity1LogicalName: entity1LogicalName,
          Entity2LogicalName: entity2LogicalName
        };

        if (intersectEntityName) {
          definition.IntersectEntityName = intersectEntityName;
        }

        const metadataId = await service.createManyToManyRelationship(definition, solutionUniqueName);

        return {
          structuredContent: { success: true, metadataId, relationshipName: schemaName },
          content: [
            {
              type: "text",
              text: `Successfully created N:N relationship '${schemaName}' between '${entity1LogicalName}' and '${entity2LogicalName}'. Remember to publish both entities.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating relationship:", error);
        return {
          structuredContent: { success: false, relationshipName: schemaName },
          content: [
            {
              type: "text",
              text: `Failed to create relationship: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Relationship
  server.registerTool(
    "delete-relationship",
    {
      title: "Delete Relationship",
      description: "Delete a relationship between tables",
      inputSchema: {
        schemaName: z.string().describe("The schema name of the relationship to delete"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        relationshipName: z.string(),
      }),
    },
    async ({ schemaName }) => {
      try {
        const service = ctx.getCustomizationService();
        await service.deleteRelationship(schemaName);

        return {
          structuredContent: { success: true, relationshipName: schemaName },
          content: [
            {
              type: "text",
              text: `Successfully deleted relationship '${schemaName}'.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error deleting relationship:", error);
        return {
          structuredContent: { success: false, relationshipName: schemaName },
          content: [
            {
              type: "text",
              text: `Failed to delete relationship: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================================
  // Global Option Set Tools
  // ============================================================================

  // Create Global Option Set
  server.registerTool(
    "create-global-option-set",
    {
      title: "Create Global Option Set",
      description: "Create a new global option set (choice) that can be reused across multiple tables",
      inputSchema: {
        name: z.string().describe("Schema name for the option set (e.g., 'new_priority')"),
        displayName: z.string().describe("Display name for the option set"),
        description: z.string().optional().describe("Description of the option set"),
        options: z.array(z.object({
          label: z.string().describe("Option label"),
          value: z.number().describe("Option value (unique integer)")
        })).min(1).describe("Array of options"),
        solutionUniqueName: z.string().optional().describe("Solution to add the option set to"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        metadataId: z.string().optional(),
        optionSetName: z.string(),
      }),
    },
    async ({ name, displayName, description, options, solutionUniqueName }) => {
      try {
        const service = ctx.getCustomizationService();

        const definition: GlobalOptionSetDefinition = {
          '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
          Name: name,
          DisplayName: createLabel(displayName),
          IsGlobal: true,
          OptionSetType: 'Picklist',
          Options: options.map(opt => ({
            Value: opt.value,
            Label: createLabel(opt.label)
          }))
        };

        if (description) {
          definition.Description = createLabel(description);
        }

        const metadataId = await service.createGlobalOptionSet(definition, solutionUniqueName);

        return {
          structuredContent: { success: true, metadataId, optionSetName: name },
          content: [
            {
              type: "text",
              text: `Successfully created global option set '${name}' with ${options.length} options.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating global option set:", error);
        return {
          structuredContent: { success: false, optionSetName: name },
          content: [
            {
              type: "text",
              text: `Failed to create global option set: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Add Option to Global Option Set
  server.registerTool(
    "add-option-to-global-option-set",
    {
      title: "Add Option to Global Option Set",
      description: "Add a new option value to an existing global option set",
      inputSchema: {
        optionSetName: z.string().describe("The name of the global option set"),
        label: z.string().describe("Label for the new option"),
        value: z.number().optional().describe("Optional specific value (auto-generated if not provided)"),
        solutionUniqueName: z.string().optional().describe("Solution context"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        newValue: z.number().optional(),
        optionSetName: z.string(),
      }),
    },
    async ({ optionSetName, label, value, solutionUniqueName }) => {
      try {
        const service = ctx.getCustomizationService();

        const newValue = await service.insertOptionValue(
          optionSetName,
          createLabel(label),
          value,
          undefined,
          solutionUniqueName
        );

        return {
          structuredContent: { success: true, newValue, optionSetName },
          content: [
            {
              type: "text",
              text: `Successfully added option '${label}' with value ${newValue} to '${optionSetName}'.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error adding option:", error);
        return {
          structuredContent: { success: false, optionSetName },
          content: [
            {
              type: "text",
              text: `Failed to add option: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Global Option Set
  server.registerTool(
    "delete-global-option-set",
    {
      title: "Delete Global Option Set",
      description: "Delete a global option set. Cannot delete if in use by any columns.",
      inputSchema: {
        name: z.string().describe("The name of the global option set to delete"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        optionSetName: z.string(),
      }),
    },
    async ({ name }) => {
      try {
        const service = ctx.getCustomizationService();
        await service.deleteGlobalOptionSet(name);

        return {
          structuredContent: { success: true, optionSetName: name },
          content: [
            {
              type: "text",
              text: `Successfully deleted global option set '${name}'.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error deleting global option set:", error);
        return {
          structuredContent: { success: false, optionSetName: name },
          content: [
            {
              type: "text",
              text: `Failed to delete global option set: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================================
  // Publishing Tools
  // ============================================================================

  // Publish Entity
  server.registerTool(
    "publish-entity",
    {
      title: "Publish Entity",
      description: "Publish customizations for a specific table to make changes available in the UI",
      inputSchema: {
        entityLogicalName: z.string().describe("The logical name of the table to publish"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        entityName: z.string(),
      }),
    },
    async ({ entityLogicalName }) => {
      try {
        const service = ctx.getCustomizationService();
        await service.publishEntity(entityLogicalName);

        return {
          structuredContent: { success: true, entityName: entityLogicalName },
          content: [
            {
              type: "text",
              text: `Successfully published customizations for '${entityLogicalName}'.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error publishing entity:", error);
        return {
          structuredContent: { success: false, entityName: entityLogicalName },
          content: [
            {
              type: "text",
              text: `Failed to publish entity: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Publish All
  server.registerTool(
    "publish-all-customizations",
    {
      title: "Publish All Customizations",
      description: "Publish all pending customizations. Use sparingly as this can be slow for large environments.",
      inputSchema: {},
      outputSchema: z.object({
        success: z.boolean(),
      }),
    },
    async () => {
      try {
        const service = ctx.getCustomizationService();
        await service.publishAll();

        return {
          structuredContent: { success: true },
          content: [
            {
              type: "text",
              text: `Successfully published all customizations.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error publishing all:", error);
        return {
          structuredContent: { success: false },
          content: [
            {
              type: "text",
              text: `Failed to publish all customizations: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
