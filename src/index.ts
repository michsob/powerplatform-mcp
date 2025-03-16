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
    } catch (error) {
      console.error("Error getting entity metadata:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity metadata: ${error}`,
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
    } catch (error) {
      console.error("Error getting entity attributes:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity attributes: ${error}`,
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
    } catch (error) {
      console.error("Error getting entity attribute:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity attribute: ${error}`,
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
    } catch (error) {
      console.error("Error getting entity relationships:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity relationships: ${error}`,
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
    } catch (error) {
      console.error("Error getting global option set:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get global option set: ${error}`,
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
    } catch (error) {
      console.error("Error getting record:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get record: ${error}`,
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
    } catch (error) {
      console.error("Error querying records:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to query records: ${error}`,
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