import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServiceContext } from "../types.js";

/**
 * Register dependency checking tools with the MCP server.
 */
export function registerDependencyTools(server: McpServer, ctx: ServiceContext): void {
  // Check Component Dependencies
  server.registerTool(
    "check-component-dependencies",
    {
      title: "Check Component Dependencies",
      description: "Check dependencies for a PowerPlatform component before deletion. Returns all components that depend on the specified component.",
      inputSchema: {
        componentId: z.string().describe("The GUID of the component to check"),
        componentType: z.number().describe("The component type number (e.g., 1=Entity, 9=OptionSet, 29=Workflow, 80=PluginAssembly, 90=PluginType, 92=SdkMessageProcessingStep)"),
      },
      outputSchema: z.object({
        componentId: z.string(),
        componentType: z.number(),
        dependencies: z.any(),
      }),
    },
    async ({ componentId, componentType }) => {
      try {
        const service = ctx.getDependencyService();
        const dependencies = await service.checkDependencies(componentId, componentType);

        return {
          structuredContent: { componentId, componentType, dependencies },
          content: [
            {
              type: "text",
              text: `Dependencies for component '${componentId}' (type ${componentType}):\n\n${JSON.stringify(dependencies, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error checking component dependencies:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to check component dependencies: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Check Delete Eligibility
  server.registerTool(
    "check-delete-eligibility",
    {
      title: "Check Delete Eligibility",
      description: "Check if a PowerPlatform component can be safely deleted. Returns whether deletion is allowed and lists blocking dependencies.",
      inputSchema: {
        componentId: z.string().describe("The GUID of the component to check"),
        componentType: z.number().describe("The component type number (e.g., 1=Entity, 9=OptionSet, 29=Workflow, 80=PluginAssembly, 90=PluginType, 92=SdkMessageProcessingStep)"),
      },
      outputSchema: z.object({
        componentId: z.string(),
        componentType: z.number(),
        canDelete: z.boolean(),
        dependencies: z.array(z.any()),
      }),
    },
    async ({ componentId, componentType }) => {
      try {
        const service = ctx.getDependencyService();
        const result = await service.checkDeleteEligibility(componentId, componentType);

        const statusText = result.canDelete
          ? "✓ Component can be safely deleted (no dependencies found)"
          : `✗ Component cannot be deleted (${result.dependencies.length} dependencies found)`;

        return {
          structuredContent: { componentId, componentType, ...result },
          content: [
            {
              type: "text",
              text: `Delete eligibility for component '${componentId}' (type ${componentType}):\n\n${statusText}\n\nDependencies:\n${JSON.stringify(result.dependencies, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error checking delete eligibility:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to check delete eligibility: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
