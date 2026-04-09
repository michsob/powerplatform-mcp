import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register Custom API tools with the MCP server.
 */
export function registerCustomApiTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Custom APIs
  server.registerTool(
    "get-custom-apis",
    {
      title: "Get Custom APIs",
      description: "List Custom API definitions in the PowerPlatform environment with optional filtering",
      inputSchema: {
        maxRecords: z.number().optional().describe("Maximum number of records to return (default: 100)"),
        includeManaged: z.boolean().optional().describe("Include managed Custom APIs (default: false)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        customApis: z.any(),
      }),
    },
    async ({ maxRecords, includeManaged, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getCustomApiService();
        const result = await service.getCustomApis({ maxRecords, includeManaged });

        return {
          structuredContent: { customApis: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} Custom APIs:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting Custom APIs:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get Custom APIs: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Custom API
  server.registerTool(
    "get-custom-api",
    {
      title: "Get Custom API",
      description: "Get a single Custom API definition by unique name",
      inputSchema: {
        uniqueName: z.string().describe("The unique name of the Custom API"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        customApi: z.any(),
      }),
    },
    async ({ uniqueName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getCustomApiService();
        const result = await service.getCustomApi(uniqueName);

        if (!result) {
          return {
            content: [
              {
                type: "text",
                text: `Custom API '${uniqueName}' not found`,
              },
            ],
          };
        }

        return {
          structuredContent: { customApi: result },
          content: [
            {
              type: "text",
              text: `Custom API '${uniqueName}':\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting Custom API:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get Custom API: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Create Custom API
  server.registerTool(
    "create-custom-api",
    {
      title: "Create Custom API",
      description: "Create a new Custom API definition in Dataverse",
      inputSchema: {
        uniqueName: z.string().describe("Unique name for the Custom API"),
        name: z.string().describe("Logical name"),
        displayName: z.string().describe("Display name"),
        description: z.string().optional().describe("Description"),
        bindingType: z.number().describe("Binding type: 0=Global, 1=Entity, 2=EntityCollection"),
        boundEntityLogicalName: z.string().optional().describe("Bound entity logical name (required when bindingType is 1 or 2)"),
        isFunction: z.boolean().describe("Whether this is a function (true) or action (false)"),
        isPrivate: z.boolean().describe("Whether this Custom API is private"),
        allowedCustomProcessingStepType: z.number().describe("Processing step type: 0=None, 1=AsyncOnly, 2=SyncAndAsync"),
        pluginTypeId: z.string().optional().describe("Plugin type ID to bind (runs at MainOperation)"),
        pluginTypeName: z.string().optional().describe("Plugin type class name to look up and bind (e.g. miejskinajem.Plugins.Hospitable.SyncProperties)"),
        solutionName: z.string().optional().describe("Solution unique name to add the component to"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        customApiId: z.string(),
      }),
    },
    async ({ uniqueName, name, displayName, description, bindingType, boundEntityLogicalName, isFunction, isPrivate, allowedCustomProcessingStepType, pluginTypeId, pluginTypeName, solutionName, environment }) => {
      try {
        const ctx = registry.getContext(environment);

        // Resolve plugin type ID from name if provided
        let resolvedPluginTypeId = pluginTypeId;
        if (!resolvedPluginTypeId && pluginTypeName) {
          const pluginType = await ctx.getPluginService().getPluginType(pluginTypeName);
          if (!pluginType) {
            return {
              content: [{ type: "text", text: `Plugin type '${pluginTypeName}' not found` }],
            };
          }
          resolvedPluginTypeId = pluginType.plugintypeid as string;
        }

        const service = ctx.getCustomApiService();
        const result = await service.createCustomApi({
          uniqueName, name, displayName, description, bindingType,
          boundEntityLogicalName, isFunction, isPrivate,
          allowedCustomProcessingStepType, pluginTypeId: resolvedPluginTypeId, solutionName,
        });

        return {
          structuredContent: { customApiId: result.customApiId },
          content: [
            {
              type: "text",
              text: `Created Custom API '${uniqueName}' (ID: ${result.customApiId})`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating Custom API:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create Custom API: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Custom API Response Properties
  server.registerTool(
    "get-custom-api-response-properties",
    {
      title: "Get Custom API Response Properties",
      description: "List response properties for a Custom API",
      inputSchema: {
        customApiId: z.string().describe("The Custom API ID"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        responseProperties: z.any(),
      }),
    },
    async ({ customApiId, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getCustomApiService();
        const result = await service.getCustomApiResponseProperties(customApiId);

        return {
          structuredContent: { responseProperties: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} response properties:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting Custom API response properties:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get Custom API response properties: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Create Custom API Response Property
  server.registerTool(
    "create-custom-api-response-property",
    {
      title: "Create Custom API Response Property",
      description: "Create a response property for a Custom API",
      inputSchema: {
        customApiId: z.string().describe("The Custom API ID to link to"),
        uniqueName: z.string().describe("Unique name for the response property"),
        name: z.string().describe("Logical name"),
        displayName: z.string().describe("Display name"),
        description: z.string().optional().describe("Description"),
        type: z.number().describe("Type code: 0=Boolean, 1=DateTime, 2=Decimal, 3=Entity, 4=EntityCollection, 5=EntityReference, 6=Float, 7=Integer, 8=Money, 9=Picklist, 10=String, 11=StringArray, 12=Guid"),
        logicalEntityName: z.string().optional().describe("Logical entity name (required for Entity, EntityCollection, EntityReference types)"),
        isOptional: z.boolean().optional().describe("Whether this property is optional (default: false)"),
        solutionName: z.string().optional().describe("Solution unique name to add the component to"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        responsePropertyId: z.string(),
      }),
    },
    async ({ customApiId, uniqueName, name, displayName, description, type, logicalEntityName, isOptional, solutionName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getCustomApiService();
        const result = await service.createCustomApiResponseProperty({
          customApiId, uniqueName, name, displayName, description,
          type, logicalEntityName, isOptional, solutionName,
        });

        return {
          structuredContent: { responsePropertyId: result.responsePropertyId },
          content: [
            {
              type: "text",
              text: `Created response property '${uniqueName}' (ID: ${result.responsePropertyId})`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating Custom API response property:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create Custom API response property: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Custom API Request Parameters
  server.registerTool(
    "get-custom-api-request-parameters",
    {
      title: "Get Custom API Request Parameters",
      description: "List request parameters for a Custom API",
      inputSchema: {
        customApiId: z.string().describe("The Custom API ID"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        requestParameters: z.any(),
      }),
    },
    async ({ customApiId, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getCustomApiService();
        const result = await service.getCustomApiRequestParameters(customApiId);

        return {
          structuredContent: { requestParameters: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} request parameters:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting Custom API request parameters:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get Custom API request parameters: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Create Custom API Request Parameter
  server.registerTool(
    "create-custom-api-request-parameter",
    {
      title: "Create Custom API Request Parameter",
      description: "Create a request parameter for a Custom API",
      inputSchema: {
        customApiId: z.string().describe("The Custom API ID to link to"),
        uniqueName: z.string().describe("Unique name for the request parameter"),
        name: z.string().describe("Logical name"),
        displayName: z.string().describe("Display name"),
        description: z.string().optional().describe("Description"),
        type: z.number().describe("Type code: 0=Boolean, 1=DateTime, 2=Decimal, 3=Entity, 4=EntityCollection, 5=EntityReference, 6=Float, 7=Integer, 8=Money, 9=Picklist, 10=String, 11=StringArray, 12=Guid"),
        logicalEntityName: z.string().optional().describe("Logical entity name (required for Entity, EntityCollection, EntityReference types)"),
        isOptional: z.boolean().optional().describe("Whether this parameter is optional (default: false)"),
        solutionName: z.string().optional().describe("Solution unique name to add the component to"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        requestParameterId: z.string(),
      }),
    },
    async ({ customApiId, uniqueName, name, displayName, description, type, logicalEntityName, isOptional, solutionName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getCustomApiService();
        const result = await service.createCustomApiRequestParameter({
          customApiId, uniqueName, name, displayName, description,
          type, logicalEntityName, isOptional, solutionName,
        });

        return {
          structuredContent: { requestParameterId: result.requestParameterId },
          content: [
            {
              type: "text",
              text: `Created request parameter '${uniqueName}' (ID: ${result.requestParameterId})`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating Custom API request parameter:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create Custom API request parameter: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
