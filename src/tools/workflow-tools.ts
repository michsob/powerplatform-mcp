import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register workflow tools with the MCP server.
 */
export function registerWorkflowTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Workflows
  server.registerTool(
    "get-workflows",
    {
      title: "Get Workflows",
      description: "Get all classic Dynamics workflows in the environment",
      inputSchema: {
        activeOnly: z.boolean().optional().describe("Only return active workflows (default: false)"),
        maxRecords: z.number().optional().describe("Maximum number of records to retrieve (default: 25)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        totalCount: z.number(),
        hasMore: z.boolean(),
        requestedMax: z.number(),
        workflows: z.any(),
      }),
    },
    async ({ activeOnly, maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getWorkflowService();
        const result = await service.getWorkflows(activeOnly ?? false, maxRecords ?? 25);

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} workflows${result.hasMore ? ` (more available, showing first ${result.requestedMax})` : ''}:\n\n${JSON.stringify(result.workflows, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting workflows:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get workflows: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Workflow Definition
  server.registerTool(
    "get-workflow-definition",
    {
      title: "Get Workflow Definition",
      description: "Get a specific classic workflow with its complete XAML definition or a structured summary",
      inputSchema: {
        workflowId: z.string().describe("The workflow ID (GUID)"),
        summary: z.boolean().optional().describe("Return a parsed summary instead of raw XAML (default: false)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
    },
    async ({ workflowId, summary, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getWorkflowService();
        const result = await service.getWorkflowDefinition(workflowId, summary ?? false);
        const resultObj = result as Record<string, unknown>;

        return {
          structuredContent: resultObj,
          content: [
            {
              type: "text",
              text: `Workflow '${resultObj.name}'${summary ? ' (summary)' : ' (full definition)'}:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting workflow definition:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get workflow definition: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get OOTB Workflows
  server.registerTool(
    "get-ootb-workflows",
    {
      title: "Get OOTB Workflows",
      description: "Get all non-cloud-flow workflows: background workflows, business rules, actions, BPFs, on-demand workflows",
      inputSchema: {
        maxRecords: z.number().optional().describe("Maximum records (default: 500)"),
        categories: z.array(z.number()).optional().describe("Workflow categories to include. 0=Background, 1=On-Demand, 2=Business Rule, 3=Action, 4=BPF"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
    },
    async ({ maxRecords, categories, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getWorkflowService();
        const result = await service.getOotbWorkflows({
          maxRecords: maxRecords ?? 500,
          categories,
        });

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} OOTB workflows:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting OOTB workflows:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get OOTB workflows: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
