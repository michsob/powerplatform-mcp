import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "../types.js";
import { registerEntityTools } from "./entityTools.js";
import { registerRecordTools } from "./recordTools.js";
import { registerOptionSetTools } from "./optionSetTools.js";
import { registerPluginTools } from "./pluginTools.js";
import { registerDependencyTools } from "./dependencyTools.js";

export { registerEntityTools } from "./entityTools.js";
export { registerRecordTools } from "./recordTools.js";
export { registerOptionSetTools } from "./optionSetTools.js";
export { registerPluginTools } from "./pluginTools.js";
export { registerDependencyTools } from "./dependencyTools.js";

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
