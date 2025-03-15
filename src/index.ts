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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Initializing PowerPlatform MCP Server...");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});