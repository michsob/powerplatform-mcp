import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";
import { missingDependencySummary } from "../services/solution-service.js";

/**
 * Register dependency checking tools with the MCP server.
 */
export function registerDependencyTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Check Component Dependencies
  server.registerTool(
    "check-component-dependencies",
    {
      title: "Check Component Dependencies",
      description: "Check dependencies for a PowerPlatform component before deletion. Returns all components that depend on the specified component. This is about deleting the component from the environment; for whether a solution still includes everything its components need, use check-solution-dependencies.",
      inputSchema: {
        componentId: z.string().describe("The GUID of the component to check"),
        componentType: z.number().describe("The component type number (e.g., 1=Entity, 9=OptionSet, 29=Workflow, 80=ModelDrivenApp, 90=PluginType, 91=PluginAssembly, 92=SdkMessageProcessingStep)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        componentId: z.string(),
        componentType: z.number(),
        dependencies: z.any(),
      }),
    },
    async ({ componentId, componentType, environment }) => {
      try {
        const ctx = registry.getContext(environment);
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
        componentType: z.number().describe("The component type number (e.g., 1=Entity, 9=OptionSet, 29=Workflow, 80=ModelDrivenApp, 90=PluginType, 91=PluginAssembly, 92=SdkMessageProcessingStep)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        componentId: z.string(),
        componentType: z.number(),
        canDelete: z.boolean(),
        dependencies: z.array(z.any()),
      }),
    },
    async ({ componentId, componentType, environment }) => {
      try {
        const ctx = registry.getContext(environment);
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

  // Check Solution Dependencies
  server.registerTool(
    "check-solution-dependencies",
    {
      title: "Check Solution Dependencies",
      description: "Find the components that a solution's components require but the solution does not include (RetrieveMissingDependencies): what an import of the solution would need the target environment to have already. Each row names the missing component (requiredcomponent*) and the component in the solution that needs it (dependentcomponent*). Run it on both solutions after moving components between them; none missing means the solution carries everything its components need.",
      inputSchema: {
        solutionUniqueName: z.string().describe("The unique name of the solution to check"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        solutionUniqueName: z.string(),
        missingDependencies: z.array(z.any()),
      }),
    },
    async ({ solutionUniqueName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSolutionService();
        const result = await service.getMissingDependencies(solutionUniqueName);

        return {
          structuredContent: { ...result },
          content: [
            {
              type: "text",
              text: [
                ...missingDependencySummary(solutionUniqueName, result.missingDependencies),
                ...(result.missingDependencies.length > 0
                  ? ['', JSON.stringify(result.missingDependencies, null, 2)]
                  : []),
              ].join('\n'),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error checking solution dependencies:", error);
        // isError, or the SDK replaces the message with "no structured content" for a tool with an output schema.
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to check solution dependencies: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
