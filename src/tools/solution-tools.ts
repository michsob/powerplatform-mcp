import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register solution tools with the MCP server.
 */
export function registerSolutionTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Publishers
  server.registerTool(
    "get-publishers",
    {
      title: "Get Publishers",
      description: "Get all non-readonly publishers in the PowerPlatform environment",
      inputSchema: {
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        publishers: z.any(),
      }),
    },
    async ({ environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSolutionService();
        const result = await service.getPublishers();

        return {
          structuredContent: { publishers: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} publishers:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting publishers:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get publishers: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Solutions
  server.registerTool(
    "get-solutions",
    {
      title: "Get Solutions",
      description: "Get all visible solutions in the PowerPlatform environment, ordered by creation date",
      inputSchema: {
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        solutions: z.any(),
      }),
    },
    async ({ environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSolutionService();
        const result = await service.getSolutions();

        return {
          structuredContent: { solutions: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} solutions:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting solutions:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get solutions: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Solution
  server.registerTool(
    "get-solution",
    {
      title: "Get Solution",
      description: "Get a specific solution by its unique name",
      inputSchema: {
        uniqueName: z.string().describe("The unique name of the solution"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        uniqueName: z.string(),
        solution: z.any(),
      }),
    },
    async ({ uniqueName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSolutionService();
        const solution = await service.getSolution(uniqueName);

        if (!solution) {
          return {
            content: [
              {
                type: "text",
                text: `Solution '${uniqueName}' not found`,
              },
            ],
          };
        }

        return {
          structuredContent: { uniqueName, solution },
          content: [
            {
              type: "text",
              text: `Solution '${uniqueName}':\n\n${JSON.stringify(solution, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting solution:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get solution: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Solution Components
  server.registerTool(
    "get-solution-components",
    {
      title: "Get Solution Components",
      description: "Get all components in a solution, ordered by component type",
      inputSchema: {
        solutionUniqueName: z.string().describe("The unique name of the solution"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        solutionUniqueName: z.string(),
        components: z.any(),
      }),
    },
    async ({ solutionUniqueName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSolutionService();
        const result = await service.getSolutionComponents(solutionUniqueName);

        return {
          structuredContent: { solutionUniqueName, components: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} components in solution '${solutionUniqueName}':\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting solution components:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get solution components: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Export Solution
  server.registerTool(
    "export-solution",
    {
      title: "Export Solution",
      description: "Export a solution as a base64-encoded package. This is a read-only operation that serializes the solution.",
      inputSchema: {
        solutionName: z.string().describe("The unique name of the solution to export"),
        managed: z.boolean().optional().describe("Export as managed solution (default: false)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        solutionName: z.string(),
        exportResult: z.any(),
      }),
    },
    async ({ solutionName, managed, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSolutionService();
        const result = await service.exportSolution(solutionName, managed ?? false);

        return {
          structuredContent: { solutionName, exportResult: result },
          content: [
            {
              type: "text",
              text: `Solution '${solutionName}' exported successfully (managed: ${managed ?? false}):\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error exporting solution:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to export solution: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
