#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PowerPlatformService, PowerPlatformConfig } from "./PowerPlatformService.js";

// Environment configuration
// These values can be set in environment variables or loaded from a configuration file
const POWERPLATFORM_CONFIG: PowerPlatformConfig = {
  organizationUrl: process.env.POWERPLATFORM_URL || "",
  clientId: process.env.POWERPLATFORM_CLIENT_ID || "",
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET || "",
  tenantId: process.env.POWERPLATFORM_TENANT_ID || "",
};

// Create server instance
const server = new McpServer({
  name: "powerplatform-mcp",
  version: "1.0.0",
});

let powerPlatformService: PowerPlatformService | null = null;

// Function to initialize PowerPlatformService on demand
function getPowerPlatformService(): PowerPlatformService {
  if (!powerPlatformService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];
    if (!POWERPLATFORM_CONFIG.organizationUrl) missingConfig.push("organizationUrl");
    if (!POWERPLATFORM_CONFIG.clientId) missingConfig.push("clientId");
    if (!POWERPLATFORM_CONFIG.clientSecret) missingConfig.push("clientSecret");
    if (!POWERPLATFORM_CONFIG.tenantId) missingConfig.push("tenantId");
    
    if (missingConfig.length > 0) {
      throw new Error(`Missing PowerPlatform configuration: ${missingConfig.join(", ")}. Set these in environment variables.`);
    }
    
    // Initialize service
    powerPlatformService = new PowerPlatformService(POWERPLATFORM_CONFIG);
    console.error("PowerPlatform service initialized");
  }
  
  return powerPlatformService;
}

// Pre-defined PowerPlatform Prompts
const powerPlatformPrompts = {
  // Entity exploration prompts
  ENTITY_OVERVIEW: (entityName: string) => 
    `## Power Platform Entity: ${entityName}\n\n` +
    `This is an overview of the '${entityName}' entity in Microsoft Power Platform/Dataverse:\n\n` +
    `### Entity Details\n{{entity_details}}\n\n` +
    `### Attributes\n{{key_attributes}}\n\n` +
    `### Relationships\n{{relationships}}\n\n` +
    `You can query this entity using OData filters against the plural name.`,

  ATTRIBUTE_DETAILS: (entityName: string, attributeName: string) =>
    `## Attribute: ${attributeName}\n\n` +
    `Details for the '${attributeName}' attribute of the '${entityName}' entity:\n\n` +
    `{{attribute_details}}\n\n` +
    `### Usage Notes\n` +
    `- Data Type: {{data_type}}\n` +
    `- Required: {{required}}\n` +
    `- Max Length: {{max_length}}`,

  // Query builder prompts
  QUERY_TEMPLATE: (entityNamePlural: string) =>
    `## OData Query Template for ${entityNamePlural}\n\n` +
    `Use this template to build queries against the ${entityNamePlural} entity:\n\n` +
    `\`\`\`\n${entityNamePlural}?$select={{selected_fields}}&$filter={{filter_conditions}}&$orderby={{order_by}}&$top={{max_records}}\n\`\`\`\n\n` +
    `### Common Filter Examples\n` +
    `- Equals: \`name eq 'Contoso'\`\n` +
    `- Contains: \`contains(name, 'Contoso')\`\n` +
    `- Greater than date: \`createdon gt 2023-01-01T00:00:00Z\`\n` +
    `- Multiple conditions: \`name eq 'Contoso' and statecode eq 0\``,

  // Relationship exploration prompts
  RELATIONSHIP_MAP: (entityName: string) =>
    `## Relationship Map for ${entityName}\n\n` +
    `This shows all relationships for the '${entityName}' entity:\n\n` +
    `### One-to-Many Relationships (${entityName} as Primary)\n{{one_to_many_primary}}\n\n` +
    `### One-to-Many Relationships (${entityName} as Related)\n{{one_to_many_related}}\n\n` +
    `### Many-to-Many Relationships\n{{many_to_many}}\n\n`
};

// Register prompts with the server using the correct method signature
// Entity Overview Prompt
server.prompt(
  "entity-overview", 
  "Get an overview of a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity")
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get entity metadata and key attributes
      const [metadata, attributes] = await Promise.all([
        service.getEntityMetadata(entityName),
        service.getEntityAttributes(entityName)
      ]);
      
      // Format entity details
      const entityDetails = `- Display Name: ${metadata.DisplayName?.UserLocalizedLabel?.Label || entityName}\n` +
        `- Schema Name: ${metadata.SchemaName}\n` +
        `- Description: ${metadata.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
        `- Primary Key: ${metadata.PrimaryIdAttribute}\n` +
        `- Primary Name: ${metadata.PrimaryNameAttribute}`;
        
      // Get key attributes
      const keyAttributes = attributes.value
        .filter((attr: any) => attr.IsValidForRead === true && !attr.AttributeOf)
        .map((attr: any) => `- ${attr.LogicalName}: ${attr.AttributeType} (${attr.DisplayName?.UserLocalizedLabel?.Label || 'No display name'})`)
        .join('\n');
        
      // Get relationships summary
      const relationships = await service.getEntityRelationships(entityName);
      const oneToManyCount = relationships.oneToMany.value.length;
      const manyToManyCount = relationships.manyToMany.value.length;
      
      const relationshipsSummary = `- One-to-Many Relationships: ${oneToManyCount}\n` +
                                  `- Many-to-Many Relationships: ${manyToManyCount}`;
      
      let promptContent = powerPlatformPrompts.ENTITY_OVERVIEW(entityName);
      promptContent = promptContent
        .replace('{{entity_details}}', entityDetails)
        .replace('{{key_attributes}}', keyAttributes)
        .replace('{{relationships}}', relationshipsSummary);
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling entity-overview prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Attribute Details Prompt
server.prompt(
  "attribute-details",
  "Get detailed information about a specific entity attribute/field",
  {
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().describe("The logical name of the attribute"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const { entityName, attributeName } = args;
      
      // Get attribute details
      const attribute = await service.getEntityAttribute(entityName, attributeName);
      
      // Format attribute details
      const attrDetails = `- Display Name: ${attribute.DisplayName?.UserLocalizedLabel?.Label || attributeName}\n` +
        `- Description: ${attribute.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
        `- Type: ${attribute.AttributeType}\n` +
        `- Format: ${attribute.Format || 'N/A'}\n` +
        `- Is Required: ${attribute.RequiredLevel?.Value || 'No'}\n` +
        `- Is Searchable: ${attribute.IsValidForAdvancedFind || false}`;
        
      let promptContent = powerPlatformPrompts.ATTRIBUTE_DETAILS(entityName, attributeName);
      promptContent = promptContent
        .replace('{{attribute_details}}', attrDetails)
        .replace('{{data_type}}', attribute.AttributeType)
        .replace('{{required}}', attribute.RequiredLevel?.Value || 'No')
        .replace('{{max_length}}', attribute.MaxLength || 'N/A');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling attribute-details prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Query Template Prompt
server.prompt(
  "query-template",
  "Get a template for querying a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get entity metadata to determine plural name
      const metadata = await service.getEntityMetadata(entityName);
      const entityNamePlural = metadata.EntitySetName;
      
      // Get a few important fields for the select example
      const attributes = await service.getEntityAttributes(entityName);
      const selectFields = attributes.value
        .filter((attr: any) => attr.IsValidForRead === true && !attr.AttributeOf)
        .slice(0, 5) // Just take first 5 for example
        .map((attr: any) => attr.LogicalName)
        .join(',');
        
      let promptContent = powerPlatformPrompts.QUERY_TEMPLATE(entityNamePlural);
      promptContent = promptContent
        .replace('{{selected_fields}}', selectFields)
        .replace('{{filter_conditions}}', `${metadata.PrimaryNameAttribute} eq 'Example'`)
        .replace('{{order_by}}', `${metadata.PrimaryNameAttribute} asc`)
        .replace('{{max_records}}', '50');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling query-template prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Relationship Map Prompt
server.prompt(
  "relationship-map",
  "Get a list of relationships for a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get relationships
      const relationships = await service.getEntityRelationships(entityName);
      
      // Format one-to-many relationships where this entity is primary
      const oneToManyPrimary = relationships.oneToMany.value
        .filter((rel: any) => rel.ReferencingEntity !== entityName)
        .map((rel: any) => `- ${rel.SchemaName}: ${entityName} (1) → ${rel.ReferencingEntity} (N)`)
        .join('\n');
        
      // Format one-to-many relationships where this entity is related
      const oneToManyRelated = relationships.oneToMany.value
        .filter((rel: any) => rel.ReferencingEntity === entityName)
        .map((rel: any) => `- ${rel.SchemaName}: ${rel.ReferencedEntity} (1) → ${entityName} (N)`)
        .join('\n');
        
      // Format many-to-many relationships
      const manyToMany = relationships.manyToMany.value
        .map((rel: any) => {
          const otherEntity = rel.Entity1LogicalName === entityName ? rel.Entity2LogicalName : rel.Entity1LogicalName;
          return `- ${rel.SchemaName}: ${entityName} (N) ↔ ${otherEntity} (N)`;
        })
        .join('\n');
      
      let promptContent = powerPlatformPrompts.RELATIONSHIP_MAP(entityName);
      promptContent = promptContent
        .replace('{{one_to_many_primary}}', oneToManyPrimary || 'None found')
        .replace('{{one_to_many_related}}', oneToManyRelated || 'None found')
        .replace('{{many_to_many}}', manyToMany || 'None found');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling relationship-map prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// PowerPlatform entity metadata
server.tool(
  "get-entity-metadata",
  "Get metadata about a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const metadata = await service.getEntityMetadata(entityName);
      
      // Format the metadata as a string for text display
      const metadataStr = JSON.stringify(metadata, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Entity metadata for '${entityName}':\n\n${metadataStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity metadata:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity metadata: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform entity attributes
server.tool(
  "get-entity-attributes",
  "Get attributes/fields of a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const attributes = await service.getEntityAttributes(entityName);
      
      // Format the attributes as a string for text display
      const attributesStr = JSON.stringify(attributes, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Attributes for entity '${entityName}':\n\n${attributesStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity attributes:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity attributes: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform specific entity attribute
server.tool(
  "get-entity-attribute",
  "Get a specific attribute/field of a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().describe("The logical name of the attribute")
  },
  async ({ entityName, attributeName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const attribute = await service.getEntityAttribute(entityName, attributeName);
      
      // Format the attribute as a string for text display
      const attributeStr = JSON.stringify(attribute, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Attribute '${attributeName}' for entity '${entityName}':\n\n${attributeStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity attribute:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity attribute: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform entity relationships
server.tool(
  "get-entity-relationships",
  "Get relationships (one-to-many and many-to-many) for a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const relationships = await service.getEntityRelationships(entityName);
      
      // Format the relationships as a string for text display
      const relationshipsStr = JSON.stringify(relationships, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Relationships for entity '${entityName}':\n\n${relationshipsStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity relationships:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity relationships: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform global option set
server.tool(
  "get-global-option-set",
  "Get a global option set definition by name",
  {
    optionSetName: z.string().describe("The name of the global option set"),
  },
  async ({ optionSetName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const optionSet = await service.getGlobalOptionSet(optionSetName);
      
      // Format the option set as a string for text display
      const optionSetStr = JSON.stringify(optionSet, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Global option set '${optionSetName}':\n\n${optionSetStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting global option set:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get global option set: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform record by ID
server.tool(
  "get-record",
  "Get a specific record by entity name (plural) and ID",
  {
    entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
    recordId: z.string().describe("The GUID of the record"),
  },
  async ({ entityNamePlural, recordId }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const record = await service.getRecord(entityNamePlural, recordId);
      
      // Format the record as a string for text display
      const recordStr = JSON.stringify(record, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Record from '${entityNamePlural}' with ID '${recordId}':\n\n${recordStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting record:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get record: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform query records with filter
server.tool(
  "query-records",
  "Query records using an OData filter expression",
  {
    entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
    filter: z.string().describe("OData filter expression (e.g., \"name eq 'test'\" or \"createdon gt 2023-01-01\")"),
    maxRecords: z.number().optional().describe("Maximum number of records to retrieve (default: 50)"),
  },
  async ({ entityNamePlural, filter, maxRecords }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const records = await service.queryRecords(entityNamePlural, filter, maxRecords || 50);
      
      // Format the records as a string for text display
      const recordsStr = JSON.stringify(records, null, 2);
      const recordCount = records.value?.length || 0;
      
      return {
        content: [
          {
            type: "text",
            text: `Retrieved ${recordCount} records from '${entityNamePlural}' with filter '${filter}':\n\n${recordsStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error querying records:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to query records: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform MCP Prompts
server.tool(
  "use-powerplatform-prompt",
  "Use a predefined prompt template for PowerPlatform entities",
  {
    promptType: z.enum([
      "ENTITY_OVERVIEW", 
      "ATTRIBUTE_DETAILS", 
      "QUERY_TEMPLATE", 
      "RELATIONSHIP_MAP"
    ]).describe("The type of prompt template to use"),
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().optional().describe("The logical name of the attribute (required for ATTRIBUTE_DETAILS prompt)"),
  },
  async ({ promptType, entityName, attributeName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      
      let promptContent = "";
      let replacements: Record<string, string> = {};
      
      switch (promptType) {
        case "ENTITY_OVERVIEW": {
          // Get entity metadata and key attributes
          const [metadata, attributes] = await Promise.all([
            service.getEntityMetadata(entityName),
            service.getEntityAttributes(entityName)
          ]);
          
          // Format entity details
          const entityDetails = `- Display Name: ${metadata.DisplayName?.UserLocalizedLabel?.Label || entityName}\n` +
            `- Schema Name: ${metadata.SchemaName}\n` +
            `- Description: ${metadata.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
            `- Primary Key: ${metadata.PrimaryIdAttribute}\n` +
            `- Primary Name: ${metadata.PrimaryNameAttribute}`;
            
          // Get key attributes
          const keyAttributes = attributes.value
            .filter((attr: any) => attr.IsValidForRead === true && !attr.AttributeOf)
            //.slice(0, 10) // Limit to first 10 important attributes
            .map((attr: any) => `- ${attr.LogicalName}: ${attr.AttributeType} (${attr.DisplayName?.UserLocalizedLabel?.Label || 'No display name'})`)
            .join('\n');
            
          // Get relationships summary
          const relationships = await service.getEntityRelationships(entityName);
          const oneToManyCount = relationships.oneToMany.value.length;
          const manyToManyCount = relationships.manyToMany.value.length;
          
          const relationshipsSummary = `- One-to-Many Relationships: ${oneToManyCount}\n` +
                                      `- Many-to-Many Relationships: ${manyToManyCount}`;
          
          promptContent = powerPlatformPrompts.ENTITY_OVERVIEW(entityName);
          replacements = {
            '{{entity_details}}': entityDetails,
            '{{key_attributes}}': keyAttributes,
            '{{relationships}}': relationshipsSummary
          };
          break;
        }
        
        case "ATTRIBUTE_DETAILS": {
          if (!attributeName) {
            throw new Error("attributeName is required for ATTRIBUTE_DETAILS prompt");
          }
          
          // Get attribute details
          const attribute = await service.getEntityAttribute(entityName, attributeName);
          
          // Format attribute details
          const attrDetails = `- Display Name: ${attribute.DisplayName?.UserLocalizedLabel?.Label || attributeName}\n` +
            `- Description: ${attribute.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
            `- Type: ${attribute.AttributeType}\n` +
            `- Format: ${attribute.Format || 'N/A'}\n` +
            `- Is Required: ${attribute.RequiredLevel?.Value || 'No'}\n` +
            `- Is Searchable: ${attribute.IsValidForAdvancedFind || false}`;
            
          promptContent = powerPlatformPrompts.ATTRIBUTE_DETAILS(entityName, attributeName);
          replacements = {
            '{{attribute_details}}': attrDetails,
            '{{data_type}}': attribute.AttributeType,
            '{{required}}': attribute.RequiredLevel?.Value || 'No',
            '{{max_length}}': attribute.MaxLength || 'N/A'
          };
          break;
        }
        
        case "QUERY_TEMPLATE": {
          // Get entity metadata to determine plural name
          const metadata = await service.getEntityMetadata(entityName);
          const entityNamePlural = metadata.EntitySetName;
          
          // Get a few important fields for the select example
          const attributes = await service.getEntityAttributes(entityName);
          const selectFields = attributes.value
            .filter((attr: any) => attr.IsValidForRead === true && !attr.AttributeOf)
            .slice(0, 5) // Just take first 5 for example
            .map((attr: any) => attr.LogicalName)
            .join(',');
            
          promptContent = powerPlatformPrompts.QUERY_TEMPLATE(entityNamePlural);
          replacements = {
            '{{selected_fields}}': selectFields,
            '{{filter_conditions}}': `${metadata.PrimaryNameAttribute} eq 'Example'`,
            '{{order_by}}': `${metadata.PrimaryNameAttribute} asc`,
            '{{max_records}}': '50'
          };
          break;
        }
        
        case "RELATIONSHIP_MAP": {
          // Get relationships
          const relationships = await service.getEntityRelationships(entityName);
          
          // Format one-to-many relationships where this entity is primary
          const oneToManyPrimary = relationships.oneToMany.value
            .filter((rel: any) => rel.ReferencingEntity !== entityName)
            //.slice(0, 10) // Limit to 10 for readability
            .map((rel: any) => `- ${rel.SchemaName}: ${entityName} (1) → ${rel.ReferencingEntity} (N)`)
            .join('\n');
            
          // Format one-to-many relationships where this entity is related
          const oneToManyRelated = relationships.oneToMany.value
            .filter((rel: any) => rel.ReferencingEntity === entityName)
            //.slice(0, 10) // Limit to 10 for readability
            .map((rel: any) => `- ${rel.SchemaName}: ${rel.ReferencedEntity} (1) → ${entityName} (N)`)
            .join('\n');
            
          // Format many-to-many relationships
          const manyToMany = relationships.manyToMany.value
            //.slice(0, 10) // Limit to 10 for readability
            .map((rel: any) => {
              const otherEntity = rel.Entity1LogicalName === entityName ? rel.Entity2LogicalName : rel.Entity1LogicalName;
              return `- ${rel.SchemaName}: ${entityName} (N) ↔ ${otherEntity} (N)`;
            })
            .join('\n');
          
          promptContent = powerPlatformPrompts.RELATIONSHIP_MAP(entityName);
          replacements = {
            '{{one_to_many_primary}}': oneToManyPrimary || 'None found',
            '{{one_to_many_related}}': oneToManyRelated || 'None found',
            '{{many_to_many}}': manyToMany || 'None found'
          };
          break;
        }
      }
      
      // Replace all placeholders in the template
      for (const [placeholder, value] of Object.entries(replacements)) {
        promptContent = promptContent.replace(placeholder, value);
      }
      
      return {
        content: [
          {
            type: "text",
            text: promptContent,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error using PowerPlatform prompt:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to use PowerPlatform prompt: ${error.message}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Initializing PowerPlatform MCP Server...");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});