import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register configuration tools with the MCP server.
 */
export function registerConfigurationTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Connection References
  server.registerTool(
    "get-connection-references",
    {
      title: "Get Connection References",
      description: "Get connection references in the PowerPlatform environment with optional filtering by managed status, connection presence, and active state",
      inputSchema: {
        maxRecords: z.number().optional().describe("Maximum number of records to return (default: 100)"),
        managedOnly: z.boolean().optional().describe("Only return managed connection references (default: false)"),
        hasConnection: z.boolean().optional().describe("Filter to connection references that have (true) or lack (false) a connection set"),
        inactive: z.boolean().optional().describe("Filter to inactive connection references (statecode ne 0)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        connectionReferences: z.any(),
      }),
    },
    async ({ maxRecords, managedOnly, hasConnection, inactive, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getConfigurationService();
        const result = await service.getConnectionReferences({ maxRecords, managedOnly, hasConnection, inactive });

        return {
          structuredContent: { connectionReferences: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} connection references:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting connection references:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get connection references: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Environment Variables
  server.registerTool(
    "get-environment-variables",
    {
      title: "Get Environment Variables",
      description: "Get environment variable definitions and their current values from the PowerPlatform environment",
      inputSchema: {
        maxRecords: z.number().optional().describe("Maximum number of records to return (default: 100)"),
        managedOnly: z.boolean().optional().describe("Only return managed environment variables (default: false)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        environmentVariables: z.any(),
      }),
    },
    async ({ maxRecords, managedOnly, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getConfigurationService();
        const result = await service.getEnvironmentVariables({ maxRecords, managedOnly });

        return {
          structuredContent: { environmentVariables: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} environment variables:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting environment variables:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get environment variables: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
