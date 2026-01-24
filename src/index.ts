#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PowerPlatformClient, PowerPlatformConfig } from "./PowerPlatformClient.js";
import { EntityService, RecordService, OptionSetService, PluginService, DependencyService } from "./services/index.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllPrompts } from "./prompts/index.js";
import type { ServiceContext } from "./types.js";

// Environment configuration
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

// Service instances (lazy initialized)
let powerPlatformClient: PowerPlatformClient | null = null;
let entityService: EntityService | null = null;
let recordService: RecordService | null = null;
let optionSetService: OptionSetService | null = null;
let pluginService: PluginService | null = null;
let dependencyService: DependencyService | null = null;

// Function to initialize the PowerPlatform client on demand
function getClient(): PowerPlatformClient {
  if (!powerPlatformClient) {
    // Check if configuration is complete
    const missingConfig: string[] = [];
    if (!POWERPLATFORM_CONFIG.organizationUrl) missingConfig.push("organizationUrl");
    if (!POWERPLATFORM_CONFIG.clientId) missingConfig.push("clientId");
    if (!POWERPLATFORM_CONFIG.clientSecret) missingConfig.push("clientSecret");
    if (!POWERPLATFORM_CONFIG.tenantId) missingConfig.push("tenantId");

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing PowerPlatform configuration: ${missingConfig.join(", ")}. Set these in environment variables.`
      );
    }

    powerPlatformClient = new PowerPlatformClient(POWERPLATFORM_CONFIG);
    console.error("PowerPlatform client initialized");
  }

  return powerPlatformClient;
}

// Service getters with lazy initialization
function getEntityService(): EntityService {
  if (!entityService) {
    entityService = new EntityService(getClient());
  }
  return entityService;
}

function getRecordService(): RecordService {
  if (!recordService) {
    recordService = new RecordService(getClient());
  }
  return recordService;
}

function getOptionSetService(): OptionSetService {
  if (!optionSetService) {
    optionSetService = new OptionSetService(getClient());
  }
  return optionSetService;
}

function getPluginService(): PluginService {
  if (!pluginService) {
    pluginService = new PluginService(getClient());
  }
  return pluginService;
}

function getDependencyService(): DependencyService {
  if (!dependencyService) {
    dependencyService = new DependencyService(getClient());
  }
  return dependencyService;
}

// Create service context for tools and prompts
const ctx: ServiceContext = {
  getEntityService,
  getRecordService,
  getOptionSetService,
  getPluginService,
  getDependencyService,
};

// Register all tools and prompts
registerAllTools(server, ctx);
registerAllPrompts(server, ctx);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Initializing PowerPlatform MCP Server...");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
