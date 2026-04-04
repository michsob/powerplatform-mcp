import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register option set tools with the MCP server.
 */
export function registerOptionSetTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Global Option Set
  server.registerTool(
    "get-global-option-set",
    {
      title: "Get Global Option Set",
      description: "Get a global option set definition by name",
      inputSchema: {
        optionSetName: z.string().describe("The name of the global option set"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        optionSetName: z.string(),
        optionSet: z.any(),
      }),
    },
    async ({ optionSetName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getOptionSetService();
        const optionSet = await service.getGlobalOptionSet(optionSetName);

        return {
          structuredContent: { optionSetName, optionSet },
          content: [
            {
              type: "text",
              text: `Global option set '${optionSetName}':\n\n${JSON.stringify(optionSet, null, 2)}`,
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
}
