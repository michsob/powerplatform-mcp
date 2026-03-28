import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServiceContext } from "../types.js";

/**
 * Register entity metadata tools with the MCP server.
 */
export function registerEntityTools(server: McpServer, ctx: ServiceContext): void {
  // Get Entity Metadata
  server.registerTool(
    "get-entity-metadata",
    {
      title: "Get Entity Metadata",
      description: "Get metadata about a PowerPlatform entity",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
      },
      outputSchema: z.object({
        entityName: z.string(),
        metadata: z.any(),
      }),
    },
    async ({ entityName }) => {
      try {
        const service = ctx.getEntityService();
        const metadata = await service.getEntityMetadata(entityName);

        return {
          structuredContent: { entityName, metadata },
          content: [
            {
              type: "text",
              text: `Entity metadata for '${entityName}':\n\n${JSON.stringify(metadata, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity metadata:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity metadata: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Entity Attributes
  server.registerTool(
    "get-entity-attributes",
    {
      title: "Get Entity Attributes",
      description: "Get attributes/fields of a PowerPlatform entity",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
      },
      outputSchema: z.object({
        entityName: z.string(),
        attributes: z.any(),
      }),
    },
    async ({ entityName }) => {
      try {
        const service = ctx.getEntityService();
        const attributes = await service.getEntityAttributes(entityName);

        return {
          structuredContent: { entityName, attributes },
          content: [
            {
              type: "text",
              text: `Attributes for entity '${entityName}':\n\n${JSON.stringify(attributes, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity attributes:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity attributes: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Entity Attribute
  server.registerTool(
    "get-entity-attribute",
    {
      title: "Get Entity Attribute",
      description: "Get a specific attribute/field of a PowerPlatform entity",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
        attributeName: z.string().describe("The logical name of the attribute"),
      },
      outputSchema: z.object({
        entityName: z.string(),
        attributeName: z.string(),
        attribute: z.any(),
      }),
    },
    async ({ entityName, attributeName }) => {
      try {
        const service = ctx.getEntityService();
        const attribute = await service.getEntityAttribute(entityName, attributeName);

        return {
          structuredContent: { entityName, attributeName, attribute },
          content: [
            {
              type: "text",
              text: `Attribute '${attributeName}' for entity '${entityName}':\n\n${JSON.stringify(attribute, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity attribute:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity attribute: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Entity Relationships
  server.registerTool(
    "get-entity-relationships",
    {
      title: "Get Entity Relationships",
      description: "Get relationships (one-to-many and many-to-many) for a PowerPlatform entity",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
      },
      outputSchema: z.object({
        entityName: z.string(),
        relationships: z.any(),
      }),
    },
    async ({ entityName }) => {
      try {
        const service = ctx.getEntityService();
        const relationships = await service.getEntityRelationships(entityName);

        return {
          structuredContent: { entityName, relationships },
          content: [
            {
              type: "text",
              text: `Relationships for entity '${entityName}':\n\n${JSON.stringify(relationships, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity relationships:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity relationships: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
