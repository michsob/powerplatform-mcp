import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "../types.js";
import { registerEntityTools } from "./entity-tools.js";
import { registerRecordTools } from "./record-tools.js";
import { registerOptionSetTools } from "./optionset-tools.js";
import { registerPluginTools } from "./plugin-tools.js";
import { registerDependencyTools } from "./dependency-tools.js";

export { registerEntityTools } from "./entity-tools.js";
export { registerRecordTools } from "./record-tools.js";
export { registerOptionSetTools } from "./optionset-tools.js";
export { registerPluginTools } from "./plugin-tools.js";
export { registerDependencyTools } from "./dependency-tools.js";

/**
 * Register all tools with the MCP server.
 */
export function registerAllTools(server: McpServer, ctx: ServiceContext): void {
  registerEntityTools(server, ctx);
  registerRecordTools(server, ctx);
  registerOptionSetTools(server, ctx);
  registerPluginTools(server, ctx);
  registerDependencyTools(server, ctx);
}
