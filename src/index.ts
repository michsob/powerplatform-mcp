#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EnvironmentRegistry } from "./environment-config.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllPrompts } from "./prompts/index.js";

// Create registry (env vars loaded lazily on first tool/prompt invocation)
const registry = new EnvironmentRegistry();

// Create server instance
const server = new McpServer({
  name: "powerplatform-mcp",
  version: "1.0.0",
});

// Register all tools and prompts
registerAllTools(server, registry);
registerAllPrompts(server, registry);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Initializing PowerPlatform MCP Server...");
  console.error(`Environments: ${registry.getEnvironmentNames().join(', ')} (default: ${registry.getDefaultEnvironment()})`);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
