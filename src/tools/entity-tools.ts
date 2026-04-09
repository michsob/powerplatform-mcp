import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register entity metadata tools with the MCP server.
 */
export function registerEntityTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Entity Metadata
  server.registerTool(
    "get-entity-metadata",
    {
      title: "Get Entity Metadata",
      description: "Get metadata about a PowerPlatform entity",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        entityName: z.string(),
        metadata: z.any(),
      }),
    },
    async ({ entityName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
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
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        entityName: z.string(),
        attributes: z.any(),
      }),
    },
    async ({ entityName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
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
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        entityName: z.string(),
        attributeName: z.string(),
        attribute: z.any(),
      }),
    },
    async ({ entityName, attributeName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
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

  // Create Entity String Attribute
  server.registerTool(
    "create-entity-string-attribute",
    {
      title: "Create Entity String Attribute",
      description: "Create a new Single Line of Text attribute/column on a Dataverse entity",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
        schemaName: z.string().describe("The schema name for the new attribute (e.g. br_hospitableid)"),
        displayName: z.string().describe("The display name for the attribute"),
        maxLength: z.number().optional().describe("Maximum text length (default: 100)"),
        requiredLevel: z.enum(["None", "ApplicationRequired", "SystemRequired"]).optional().describe("Required level (default: None)"),
        description: z.string().optional().describe("Description for the attribute"),
        solutionName: z.string().optional().describe("Solution unique name to add the component to"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        entityName: z.string(),
        schemaName: z.string(),
        attributeId: z.string(),
      }),
    },
    async ({ entityName, schemaName, displayName, maxLength, requiredLevel, description, solutionName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getEntityService();
        const result = await service.createStringAttribute(
          entityName, schemaName, displayName,
          maxLength ?? 100, requiredLevel ?? 'None', description,
          undefined, solutionName,
        );

        return {
          structuredContent: { entityName, schemaName, attributeId: result.attributeId },
          content: [
            {
              type: "text",
              text: `Created string attribute '${schemaName}' on entity '${entityName}' (ID: ${result.attributeId})`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating entity attribute:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create entity attribute: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Entity Keys
  server.registerTool(
    "get-entity-keys",
    {
      title: "Get Entity Keys",
      description: "Get alternate keys defined on a Dataverse entity",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        entityName: z.string(),
        keys: z.any(),
      }),
    },
    async ({ entityName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getEntityService();
        const result = await service.getEntityKeys(entityName);

        return {
          structuredContent: { entityName, keys: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} alternate keys on entity '${entityName}':\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity keys:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity keys: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Create Entity Alternate Key
  server.registerTool(
    "create-entity-alternate-key",
    {
      title: "Create Entity Alternate Key",
      description: "Create an alternate key on a Dataverse entity",
      inputSchema: {
        entityName: z.string().describe("The logical name of the entity"),
        schemaName: z.string().describe("The schema name for the key"),
        displayName: z.string().describe("The display name for the key"),
        keyAttributes: z.array(z.string()).describe("Array of attribute logical names that make up the key"),
        solutionName: z.string().optional().describe("Solution unique name to add the component to"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        entityName: z.string(),
        schemaName: z.string(),
        keyId: z.string(),
      }),
    },
    async ({ entityName, schemaName, displayName, keyAttributes, solutionName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getEntityService();
        const result = await service.createAlternateKey(entityName, schemaName, displayName, keyAttributes, undefined, solutionName);

        return {
          structuredContent: { entityName, schemaName, keyId: result.keyId },
          content: [
            {
              type: "text",
              text: `Created alternate key '${schemaName}' on entity '${entityName}' with attributes [${keyAttributes.join(', ')}] (ID: ${result.keyId})`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating alternate key:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create alternate key: ${error.message}`,
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
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        entityName: z.string(),
        relationships: z.any(),
      }),
    },
    async ({ entityName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
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
