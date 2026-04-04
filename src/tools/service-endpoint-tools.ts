import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register service endpoint tools with the MCP server.
 */
export function registerServiceEndpointTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Service Endpoints
  server.registerTool(
    "get-service-endpoints",
    {
      title: "Get Service Endpoints",
      description: "Get all service endpoints (Service Bus, webhooks, Event Hub, Event Grid)",
      inputSchema: {
        maxRecords: z.number().optional().describe("Maximum records (default: 100)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
    },
    async ({ maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getServiceEndpointService();
        const result = await service.getServiceEndpoints(maxRecords ?? 100);

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} service endpoints:\n\n${JSON.stringify(result.endpoints, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting service endpoints:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get service endpoints: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
