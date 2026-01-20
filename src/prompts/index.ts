import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServiceContext } from "../types.js";
import { registerEntityPrompts } from "./entityPrompts.js";

export { registerEntityPrompts } from "./entityPrompts.js";
export { powerPlatformPrompts } from "./templates.js";

/**
 * Register all prompts with the MCP server.
 */
export function registerAllPrompts(server: McpServer, ctx: ServiceContext): void {
  registerEntityPrompts(server, ctx);
}
