import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register business rule tools with the MCP server.
 */
export function registerBusinessRuleTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Business Rules
  server.registerTool(
    "get-business-rules",
    {
      title: "Get Business Rules",
      description: "Get all business rules in the environment",
      inputSchema: {
        activeOnly: z.boolean().optional().describe("Only return activated business rules (default: false)"),
        maxRecords: z.number().optional().describe("Maximum number of records to retrieve (default: 100)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        totalCount: z.number(),
        businessRules: z.any(),
      }),
    },
    async ({ activeOnly, maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getBusinessRuleService();
        const result = await service.getBusinessRules(activeOnly ?? false, maxRecords ?? 100);

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} business rules:\n\n${JSON.stringify(result.businessRules, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting business rules:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get business rules: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Business Rule
  server.registerTool(
    "get-business-rule",
    {
      title: "Get Business Rule",
      description: "Get a specific business rule with its complete XAML definition",
      inputSchema: {
        workflowId: z.string().describe("The workflow ID (GUID) of the business rule"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        workflowid: z.string(),
        name: z.string(),
        description: z.any(),
        state: z.string(),
        statecode: z.number(),
        statuscode: z.number(),
        type: z.string(),
        category: z.number(),
        primaryEntity: z.any(),
        isManaged: z.any(),
        owner: z.any(),
        createdOn: z.any(),
        createdBy: z.any(),
        modifiedOn: z.any(),
        modifiedBy: z.any(),
        xaml: z.any(),
      }),
    },
    async ({ workflowId, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getBusinessRuleService();
        const result = await service.getBusinessRule(workflowId);

        return {
          structuredContent: result as Record<string, unknown>,
          content: [
            {
              type: "text",
              text: `Business rule details:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting business rule:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get business rule: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
