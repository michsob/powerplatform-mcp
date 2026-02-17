import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServiceContext } from "../types.js";

/**
 * Register record tools with the MCP server.
 */
export function registerRecordTools(server: McpServer, ctx: ServiceContext): void {
  // Get Record
  server.registerTool(
    "get-record",
    {
      title: "Get Record",
      description: "Get a specific record by entity name (plural) and ID",
      inputSchema: {
        entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
        recordId: z.string().describe("The GUID of the record"),
      },
      outputSchema: z.object({
        entityNamePlural: z.string(),
        recordId: z.string(),
        record: z.any(),
      }),
    },
    async ({ entityNamePlural, recordId }) => {
      try {
        const service = ctx.getRecordService();
        const record = await service.getRecord(entityNamePlural, recordId);

        return {
          structuredContent: { entityNamePlural, recordId, record },
          content: [
            {
              type: "text",
              text: `Record from '${entityNamePlural}' with ID '${recordId}':\n\n${JSON.stringify(record, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting record:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get record: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Query Records
  server.registerTool(
    "query-records",
    {
      title: "Query Records",
      description: "Query records using an OData filter expression",
      inputSchema: {
        entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
        filter: z.string().describe("OData filter expression (e.g., \"name eq 'test'\" or \"createdon gt 2023-01-01\")"),
        maxRecords: z.number().optional().describe("Maximum number of records to retrieve (default: 50)"),
      },
      outputSchema: z.object({
        entityNamePlural: z.string(),
        filter: z.string(),
        count: z.number(),
        records: z.any(),
      }),
    },
    async ({ entityNamePlural, filter, maxRecords }) => {
      try {
        const service = ctx.getRecordService();
        const records = await service.queryRecords(entityNamePlural, filter, maxRecords || 50);
        const recordCount = records.value?.length || 0;

        return {
          structuredContent: { entityNamePlural, filter, count: recordCount, records },
          content: [
            {
              type: "text",
              text: `Retrieved ${recordCount} records from '${entityNamePlural}' with filter '${filter}':\n\n${JSON.stringify(records, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error querying records:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to query records: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
