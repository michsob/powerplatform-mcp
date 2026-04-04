import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register flow tools with the MCP server.
 */
export function registerFlowTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Flows
  server.registerTool(
    "get-flows",
    {
      title: "Get Flows",
      description: "Get Power Automate cloud flows with smart filtering (excludes system, Copilot Sales, and Customer Insights flows by default)",
      inputSchema: {
        activeOnly: z.boolean().optional().describe("Only return activated flows (default: false)"),
        maxRecords: z.number().optional().describe("Maximum number of flows to return (default: 25)"),
        excludeCustomerInsights: z.boolean().optional().describe("Exclude Customer Insights flows (default: true)"),
        excludeSystem: z.boolean().optional().describe("Exclude SYSTEM-modified flows (default: true)"),
        excludeCopilotSales: z.boolean().optional().describe("Exclude Copilot for Sales flows (default: true)"),
        nameContains: z.string().optional().describe("Filter flows by name (contains match)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        totalCount: z.number(),
        hasMore: z.boolean(),
        flows: z.any(),
      }),
    },
    async ({ activeOnly, maxRecords, excludeCustomerInsights, excludeSystem, excludeCopilotSales, nameContains, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.getFlows({
          activeOnly: activeOnly ?? false,
          maxRecords: maxRecords ?? 25,
          excludeCustomerInsights: excludeCustomerInsights ?? true,
          excludeSystem: excludeSystem ?? true,
          excludeCopilotSales: excludeCopilotSales ?? true,
          nameContains,
        });

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} flows (excluded: ${result.excluded.total}):\n\n${JSON.stringify(result.flows, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flows:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flows: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Search Workflows
  server.registerTool(
    "search-workflows",
    {
      title: "Search Workflows",
      description: "Search workflows (both classic workflows and Power Automate flows) by name, entity, description, category, or state",
      inputSchema: {
        name: z.string().optional().describe("Filter by name (contains match)"),
        primaryEntity: z.string().optional().describe("Filter by primary entity logical name"),
        description: z.string().optional().describe("Filter by description (contains match)"),
        category: z.number().optional().describe("Filter by category (0=Classic Workflow, 5=Power Automate Flow)"),
        statecode: z.number().optional().describe("Filter by state (0=Draft, 1=Activated, 2=Suspended)"),
        includeDescription: z.boolean().optional().describe("Include description in results (default: true)"),
        maxResults: z.number().optional().describe("Maximum number of results (default: 50)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        totalCount: z.number(),
        hasMore: z.boolean(),
        workflows: z.any(),
      }),
    },
    async ({ name, primaryEntity, description, category, statecode, includeDescription, maxResults, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.searchWorkflows({
          name,
          primaryEntity,
          description,
          category,
          statecode,
          includeDescription: includeDescription ?? true,
          maxResults: maxResults ?? 50,
        });

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Found ${result.totalCount} workflows:\n\n${JSON.stringify(result.workflows, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error searching workflows:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to search workflows: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Flow Definition
  server.registerTool(
    "get-flow-definition",
    {
      title: "Get Flow Definition",
      description: "Get a Power Automate flow with its complete definition or a parsed summary of triggers, actions, and connectors",
      inputSchema: {
        flowId: z.string().describe("The workflow ID (GUID)"),
        summary: z.boolean().optional().describe("Return a parsed summary instead of the full definition (default: false)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        name: z.string().optional(),
        flowDefinition: z.any(),
      }),
    },
    async ({ flowId, summary, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.getFlowDefinition(flowId, summary ?? false) as Record<string, unknown>;

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Flow definition for '${flowId}':\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flow definition:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flow definition: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Flow Runs
  server.registerTool(
    "get-flow-runs",
    {
      title: "Get Flow Runs",
      description: "Get flow run history for a specific Power Automate flow",
      inputSchema: {
        flowId: z.string().describe("The workflow ID (GUID)"),
        status: z.string().optional().describe("Filter by status: Succeeded, Failed, Running, Waiting, Cancelled"),
        startedAfter: z.string().optional().describe("Only return runs started after this date (ISO 8601)"),
        startedBefore: z.string().optional().describe("Only return runs started before this date (ISO 8601)"),
        maxRecords: z.number().optional().describe("Maximum number of runs to return (default: 50, max: 250)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        flowId: z.string(),
        totalCount: z.number(),
        hasMore: z.boolean(),
        runs: z.any(),
      }),
    },
    async ({ flowId, status, startedAfter, startedBefore, maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.getFlowRuns(flowId, {
          status,
          startedAfter,
          startedBefore,
          maxRecords: maxRecords ?? 50,
        });

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Flow runs for '${flowId}' (${result.totalCount} runs):\n\n${JSON.stringify(result.runs, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flow runs:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flow runs: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Flow Run Details
  server.registerTool(
    "get-flow-run-details",
    {
      title: "Get Flow Run Details",
      description: "Get detailed flow run information including action-level outputs and errors. For failed actions, fetches detailed error messages.",
      inputSchema: {
        flowId: z.string().describe("The workflow ID (GUID)"),
        runId: z.string().describe("The flow run ID (Flow API run name or Dataverse flowrunid GUID)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        flowId: z.string(),
        status: z.string().optional(),
        actionsSummary: z.any(),
        failedActionErrors: z.any(),
      }),
    },
    async ({ flowId, runId, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.getFlowRunDetails(flowId, runId) as Record<string, unknown>;
        const actionsSummary = result.actionsSummary as { total: number; failed: number };

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Flow run details for '${flowId}' run '${runId}':\n\n` +
                `Status: ${result.status}\n` +
                `Actions: ${actionsSummary.total} total, ${actionsSummary.failed} failed\n\n` +
                `${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flow run details:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flow run details: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Cancel Flow Run
  server.registerTool(
    "cancel-flow-run",
    {
      title: "Cancel Flow Run",
      description: "Cancel a running or waiting flow run. Cannot cancel flows already in a terminal state (Succeeded, Failed, Cancelled).",
      inputSchema: {
        flowId: z.string().describe("The workflow ID (GUID)"),
        runId: z.string().describe("The flow run ID"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        success: z.boolean(),
        flowId: z.string(),
        runId: z.string(),
        previousStatus: z.string(),
      }),
    },
    async ({ flowId, runId, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.cancelFlowRun(flowId, runId);

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Flow run cancelled successfully.\nFlow: ${flowId}\nRun: ${runId}\nPrevious status: ${result.previousStatus}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error cancelling flow run:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to cancel flow run: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Resubmit Flow Run
  server.registerTool(
    "resubmit-flow-run",
    {
      title: "Resubmit Flow Run",
      description: "Resubmit/retry a failed flow run using the original trigger inputs",
      inputSchema: {
        flowId: z.string().describe("The workflow ID (GUID)"),
        runId: z.string().describe("The flow run ID to resubmit"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        success: z.boolean(),
        flowId: z.string(),
        originalRunId: z.string(),
        newRunId: z.string(),
        triggerName: z.string(),
      }),
    },
    async ({ flowId, runId, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.resubmitFlowRun(flowId, runId);

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Flow run resubmitted successfully.\nFlow: ${flowId}\nOriginal run: ${runId}\nNew run: ${result.newRunId}\nTrigger: ${result.triggerName}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error resubmitting flow run:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to resubmit flow run: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Scan Flow Health
  server.registerTool(
    "scan-flow-health",
    {
      title: "Scan Flow Health",
      description: "Batch-scan all Power Automate cloud flows for health metrics. Fetches run history for each flow and computes success rates, failure counts. WARNING: batch operation that may take several minutes.",
      inputSchema: {
        daysBack: z.number().optional().describe("Days of run history to analyze (default: 7)"),
        maxRunsPerFlow: z.number().optional().describe("Max runs to check per flow (default: 100)"),
        maxFlows: z.number().optional().describe("Max flows to scan (default: 500)"),
        activeOnly: z.boolean().optional().describe("Only scan activated flows (default: true)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
    },
    async ({ daysBack, maxRunsPerFlow, maxFlows, activeOnly, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.scanFlowHealth({
          daysBack: daysBack ?? 7,
          maxRunsPerFlow: maxRunsPerFlow ?? 100,
          maxFlows: maxFlows ?? 500,
          activeOnly: activeOnly ?? true,
        });

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Flow health scan (last ${result.daysAnalyzed} days):\n\n` +
                `Scanned: ${result.summary.totalFlowsScanned} flows\n` +
                `Healthy: ${result.summary.flowsHealthy}, Failing: ${result.summary.flowsWithFailures}, No runs: ${result.summary.flowsNoRuns}\n` +
                `Overall success rate: ${result.summary.overallSuccessRate}%\n\n` +
                `${JSON.stringify(result.topFailingFlows, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error scanning flow health:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to scan flow health: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Flow Inventory
  server.registerTool(
    "get-flow-inventory",
    {
      title: "Get Flow Inventory",
      description: "Get complete inventory of all cloud flows (name, state, modified date). Lighter than scan-flow-health as it does not fetch run history.",
      inputSchema: {
        maxRecords: z.number().optional().describe("Maximum flows to return (default: 500)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
    },
    async ({ maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getFlowService();
        const result = await service.getFlowInventory({
          maxRecords: maxRecords ?? 500,
        });

        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Flow inventory: ${result.totalCount} flows (${result.excluded} excluded):\n\n${JSON.stringify(result.flows, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting flow inventory:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get flow inventory: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
