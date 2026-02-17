import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServiceContext } from "../types.js";
import { powerPlatformPrompts } from "./templates.js";

/**
 * Register entity prompts with the MCP server.
 */
export function registerEntityPrompts(server: McpServer, ctx: ServiceContext): void {
  // Entity Overview Prompt
  server.registerPrompt(
    "entity-overview",
    {
      title: "Entity Overview",
      description: "Get an overview of a Power Platform entity",
      argsSchema: {
        entityName: z.string().describe("The logical name of the entity"),
      },
    },
    async (args) => {
      try {
        const service = ctx.getEntityService();
        const entityName = args.entityName;

        // Get entity metadata and key attributes
        const [metadata, attributes] = await Promise.all([
          service.getEntityMetadata(entityName),
          service.getEntityAttributes(entityName),
        ]);

        // Format entity details
        const entityDetails =
          `- Display Name: ${metadata.DisplayName?.UserLocalizedLabel?.Label || entityName}\n` +
          `- Schema Name: ${metadata.SchemaName}\n` +
          `- Description: ${metadata.Description?.UserLocalizedLabel?.Label || "No description"}\n` +
          `- Primary Key: ${metadata.PrimaryIdAttribute}\n` +
          `- Primary Name: ${metadata.PrimaryNameAttribute}`;

        // Get key attributes
        const keyAttributes = attributes.value
          .map((attr: any) => {
            const attrType = attr["@odata.type"] || attr.odata?.type || "Unknown type";
            return `- ${attr.LogicalName}: ${attrType}`;
          })
          .join("\n");

        // Get relationships summary
        const relationships = await service.getEntityRelationships(entityName);
        const oneToManyCount = relationships.oneToMany.value.length;
        const manyToManyCount = relationships.manyToMany.value.length;

        const relationshipsSummary =
          `- One-to-Many Relationships: ${oneToManyCount}\n` +
          `- Many-to-Many Relationships: ${manyToManyCount}`;

        let promptContent = powerPlatformPrompts.ENTITY_OVERVIEW(entityName);
        promptContent = promptContent
          .replace("{{entity_details}}", entityDetails)
          .replace("{{key_attributes}}", keyAttributes)
          .replace("{{relationships}}", relationshipsSummary);

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: promptContent,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error(`Error handling entity-overview prompt:`, error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Error: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  // Attribute Details Prompt
  server.registerPrompt(
    "attribute-details",
    {
      title: "Attribute Details",
      description: "Get detailed information about a specific entity attribute/field",
      argsSchema: {
        entityName: z.string().describe("The logical name of the entity"),
        attributeName: z.string().describe("The logical name of the attribute"),
      },
    },
    async (args) => {
      try {
        const service = ctx.getEntityService();
        const { entityName, attributeName } = args;

        // Get attribute details
        const attribute = await service.getEntityAttribute(entityName, attributeName);

        // Format attribute details
        const attrDetails =
          `- Display Name: ${attribute.DisplayName?.UserLocalizedLabel?.Label || attributeName}\n` +
          `- Description: ${attribute.Description?.UserLocalizedLabel?.Label || "No description"}\n` +
          `- Type: ${attribute.AttributeType}\n` +
          `- Format: ${attribute.Format || "N/A"}\n` +
          `- Is Required: ${attribute.RequiredLevel?.Value || "No"}\n` +
          `- Is Searchable: ${attribute.IsValidForAdvancedFind || false}`;

        let promptContent = powerPlatformPrompts.ATTRIBUTE_DETAILS(entityName, attributeName);
        promptContent = promptContent
          .replace("{{attribute_details}}", attrDetails)
          .replace("{{data_type}}", attribute.AttributeType)
          .replace("{{required}}", attribute.RequiredLevel?.Value || "No")
          .replace("{{max_length}}", attribute.MaxLength || "N/A");

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: promptContent,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error(`Error handling attribute-details prompt:`, error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Error: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  // Query Template Prompt
  server.registerPrompt(
    "query-template",
    {
      title: "Query Template",
      description: "Get a template for querying a Power Platform entity",
      argsSchema: {
        entityName: z.string().describe("The logical name of the entity"),
      },
    },
    async (args) => {
      try {
        const service = ctx.getEntityService();
        const entityName = args.entityName;

        // Get entity metadata to determine plural name
        const metadata = await service.getEntityMetadata(entityName);
        const entityNamePlural = metadata.EntitySetName;

        // Get a few important fields for the select example
        const attributes = await service.getEntityAttributes(entityName);
        const selectFields = attributes.value
          .filter((attr: any) => attr.IsValidForRead === true && !attr.AttributeOf)
          .slice(0, 5) // Just take first 5 for example
          .map((attr: any) => attr.LogicalName)
          .join(",");

        let promptContent = powerPlatformPrompts.QUERY_TEMPLATE(entityNamePlural);
        promptContent = promptContent
          .replace("{{selected_fields}}", selectFields)
          .replace("{{filter_conditions}}", `${metadata.PrimaryNameAttribute} eq 'Example'`)
          .replace("{{order_by}}", `${metadata.PrimaryNameAttribute} asc`)
          .replace("{{max_records}}", "50");

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: promptContent,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error(`Error handling query-template prompt:`, error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Error: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  // Relationship Map Prompt
  server.registerPrompt(
    "relationship-map",
    {
      title: "Relationship Map",
      description: "Get a list of relationships for a Power Platform entity",
      argsSchema: {
        entityName: z.string().describe("The logical name of the entity"),
      },
    },
    async (args) => {
      try {
        const service = ctx.getEntityService();
        const entityName = args.entityName;

        // Get relationships
        const relationships = await service.getEntityRelationships(entityName);

        // Format one-to-many relationships where this entity is primary
        const oneToManyPrimary = relationships.oneToMany.value
          .filter((rel: any) => rel.ReferencingEntity !== entityName)
          .map((rel: any) => `- ${rel.SchemaName}: ${entityName} (1) → ${rel.ReferencingEntity} (N)`)
          .join("\n");

        // Format one-to-many relationships where this entity is related
        const oneToManyRelated = relationships.oneToMany.value
          .filter((rel: any) => rel.ReferencingEntity === entityName)
          .map((rel: any) => `- ${rel.SchemaName}: ${rel.ReferencedEntity} (1) → ${entityName} (N)`)
          .join("\n");

        // Format many-to-many relationships
        const manyToMany = relationships.manyToMany.value
          .map((rel: any) => {
            const otherEntity =
              rel.Entity1LogicalName === entityName ? rel.Entity2LogicalName : rel.Entity1LogicalName;
            return `- ${rel.SchemaName}: ${entityName} (N) ↔ ${otherEntity} (N)`;
          })
          .join("\n");

        let promptContent = powerPlatformPrompts.RELATIONSHIP_MAP(entityName);
        promptContent = promptContent
          .replace("{{one_to_many_primary}}", oneToManyPrimary || "None found")
          .replace("{{one_to_many_related}}", oneToManyRelated || "None found")
          .replace("{{many_to_many}}", manyToMany || "None found");

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: promptContent,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error(`Error handling relationship-map prompt:`, error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Error: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );
}
