import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnvironmentRegistry } from "../environment-config.js";
import { registerEntityPrompts } from "./entity-prompts.js";

export { registerEntityPrompts } from "./entity-prompts.js";
export { powerPlatformPrompts } from "./templates.js";

/**
 * Register all prompts with the MCP server.
 */
export function registerAllPrompts(server: McpServer, registry: EnvironmentRegistry): void {
  registerEntityPrompts(server, registry);
}
