import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register web resource tools with the MCP server.
 */
export function registerWebResourceTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Web Resources
  server.registerTool(
    "get-web-resources",
    {
      title: "Get Web Resources",
      description: "List web resources in a PowerPlatform environment with optional type and name filters",
      inputSchema: {
        webResourceType: z.number().optional().describe("Filter by web resource type (1=HTML, 2=CSS, 3=JavaScript, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=Silverlight, 9=StyleSheet, 10=ICO, 11=Vector, 12=SVG)"),
        nameFilter: z.string().optional().describe("Filter web resources whose name contains this string"),
        maxRecords: z.number().optional().describe("Maximum number of records to return (default: 100)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        webResources: z.any(),
        count: z.number(),
      }),
    },
    async ({ webResourceType, nameFilter, maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getWebResourceService();
        const result = await service.getWebResources({ maxRecords, webResourceType, nameFilter });
        const webResources = result.value || [];

        return {
          structuredContent: { webResources, count: webResources.length },
          content: [
            {
              type: "text",
              text: `Found ${webResources.length} web resources:\n\n${JSON.stringify(webResources, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting web resources:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get web resources: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Web Resource
  server.registerTool(
    "get-web-resource",
    {
      title: "Get Web Resource",
      description: "Get a single web resource by its exact name",
      inputSchema: {
        name: z.string().describe("The exact name of the web resource"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        name: z.string(),
        webResource: z.any(),
      }),
    },
    async ({ name, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getWebResourceService();
        const webResource = await service.getWebResource(name);

        if (!webResource) {
          return {
            content: [
              {
                type: "text",
                text: `Web resource '${name}' not found.`,
              },
            ],
          };
        }

        return {
          structuredContent: { name, webResource },
          content: [
            {
              type: "text",
              text: `Web resource '${name}':\n\n${JSON.stringify(webResource, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting web resource:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get web resource: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Create Web Resource
  server.registerTool(
    "create-web-resource",
    {
      title: "Create Web Resource",
      description: "Create a new web resource in a PowerPlatform environment. Content must be base64-encoded.",
      inputSchema: {
        name: z.string().describe("The name of the web resource (e.g. 'prefix_/scripts/main.js')"),
        displayName: z.string().describe("The display name of the web resource"),
        webResourceType: z.number().describe("Web resource type (1=HTML, 2=CSS, 3=JavaScript, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=Silverlight, 9=StyleSheet, 10=ICO, 11=Vector, 12=SVG)"),
        content: z.string().describe("The base64-encoded content of the web resource"),
        description: z.string().optional().describe("Description of the web resource"),
        solutionName: z.string().optional().describe("Solution unique name to add the component to"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        name: z.string(),
        webResourceId: z.string(),
      }),
    },
    async ({ name, displayName, webResourceType, content, description, solutionName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getWebResourceService();
        const result = await service.createWebResource({
          name, displayName, webResourceType, content, description, solutionName,
        });

        return {
          structuredContent: { name, webResourceId: result.webResourceId },
          content: [
            {
              type: "text",
              text: `Created web resource '${name}' (ID: ${result.webResourceId})`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating web resource:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create web resource: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
