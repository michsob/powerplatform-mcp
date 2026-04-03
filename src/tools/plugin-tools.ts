import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register plugin tools with the MCP server.
 */
export function registerPluginTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Plugin Assemblies
  server.registerTool(
    "get-plugin-assemblies",
    {
      title: "Get Plugin Assemblies",
      description: "Get all plugin assemblies in the environment",
      inputSchema: {
        includeManaged: z.boolean().optional().describe("Include managed assemblies (default: false)"),
        maxRecords: z.number().optional().describe("Maximum number of records to retrieve (default: 100)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        totalCount: z.number(),
        assemblies: z.any(),
      }),
    },
    async ({ includeManaged, maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getPluginService();
        const result = await service.getPluginAssemblies(includeManaged ?? false, maxRecords ?? 100);

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} plugin assemblies:\n\n${JSON.stringify(result.assemblies, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting plugin assemblies:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get plugin assemblies: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Plugin Assembly Complete
  server.registerTool(
    "get-plugin-assembly-complete",
    {
      title: "Get Plugin Assembly Complete",
      description: "Get a plugin assembly by name with all related plugin types, steps, and images",
      inputSchema: {
        assemblyName: z.string().describe("The name of the plugin assembly"),
        includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        assembly: z.any(),
        pluginTypes: z.any(),
        steps: z.any(),
        validation: z.any(),
      }),
    },
    async ({ assemblyName, includeDisabled, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getPluginService();
        const result = await service.getPluginAssemblyComplete(assemblyName, includeDisabled ?? false);

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Plugin assembly '${assemblyName}':\n\n` +
                `Plugin Types: ${result.pluginTypes.length}\n` +
                `Steps: ${result.steps.length}\n` +
                `Potential Issues: ${result.validation.potentialIssues.length > 0 ? result.validation.potentialIssues.join(', ') : 'None'}\n\n` +
                `${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting plugin assembly:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get plugin assembly: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Entity Plugin Pipeline
  server.registerTool(
    "get-entity-plugin-pipeline",
    {
      title: "Get Entity Plugin Pipeline",
      description: "Get all plugins that execute on a specific entity, organized by message and stage",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
        messageFilter: z.string().optional().describe("Filter by specific message (e.g., 'Create', 'Update', 'Delete')"),
        includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        entity: z.string(),
        messages: z.any(),
        steps: z.any(),
        executionOrder: z.any(),
      }),
    },
    async ({ entityName, messageFilter, includeDisabled, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getPluginService();
        const result = await service.getEntityPluginPipeline(entityName, messageFilter, includeDisabled ?? false);

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Plugin pipeline for entity '${entityName}':\n\n` +
                `Total Steps: ${result.steps.length}\n` +
                `Messages: ${result.messages.length}\n\n` +
                `Execution Order:\n${result.executionOrder.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\n` +
                `${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity plugin pipeline:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity plugin pipeline: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Plugin Trace Logs
  server.registerTool(
    "get-plugin-trace-logs",
    {
      title: "Get Plugin Trace Logs",
      description: "Get plugin trace logs with filtering options",
      inputSchema: {
        entityName: z.string().optional().describe("Filter by entity name"),
        messageName: z.string().optional().describe("Filter by message name (e.g., 'Create', 'Update')"),
        correlationId: z.string().optional().describe("Filter by correlation ID"),
        pluginStepId: z.string().optional().describe("Filter by plugin step ID"),
        exceptionOnly: z.boolean().optional().describe("Only show logs with exceptions (default: false)"),
        hoursBack: z.number().optional().describe("Hours to look back (default: 24)"),
        maxRecords: z.number().optional().describe("Maximum number of records (default: 50)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        totalCount: z.number(),
        logs: z.any(),
      }),
    },
    async ({ entityName, messageName, correlationId, pluginStepId, exceptionOnly, hoursBack, maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getPluginService();
        const result = await service.getPluginTraceLogs({
          entityName,
          messageName,
          correlationId,
          pluginStepId,
          exceptionOnly: exceptionOnly ?? false,
          hoursBack: hoursBack ?? 24,
          maxRecords: maxRecords ?? 50,
        });

        const exceptionCount = result.logs.filter((log: any) => log.parsed?.hasException).length;

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Plugin trace logs:\n\n` +
                `Total Logs: ${result.totalCount}\n` +
                `Exceptions: ${exceptionCount}\n\n` +
                `${JSON.stringify(result.logs, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting plugin trace logs:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get plugin trace logs: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get All Plugin Steps
  server.registerTool(
    "get-all-plugin-steps",
    {
      title: "Get All Plugin Steps",
      description: "Get all plugin SDK message processing steps across all assemblies in the environment",
      inputSchema: {
        includeDisabled: z.boolean().optional().describe("Include disabled steps (default: true)"),
        maxRecords: z.number().optional().describe("Maximum records (default: 500)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
    },
    async ({ includeDisabled, maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getPluginService();
        const result = await service.getAllPluginSteps({
          includeDisabled: includeDisabled ?? true,
          maxRecords: maxRecords ?? 500,
        });

        const enabledCount = result.steps.filter((s) => s.enabled).length;

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} plugin steps (${enabledCount} enabled):\n\n${JSON.stringify(result.steps, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting all plugin steps:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get plugin steps: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
