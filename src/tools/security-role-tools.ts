import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

/**
 * Register security role tools with the MCP server.
 */
export function registerSecurityRoleTools(server: McpServer, registry: EnvironmentRegistry): void {
  // Get Security Roles
  server.registerTool(
    "get-security-roles",
    {
      title: "Get Security Roles",
      description: "Get security roles in the PowerPlatform environment, filtered to unmanaged or customizable roles. Supports solution scoping and optional privilege details.",
      inputSchema: {
        solutionUniqueName: z.string().optional().describe("Filter to roles in a specific solution"),
        excludeSystemRoles: z.boolean().optional().describe("Exclude system roles like System Administrator (default: true)"),
        maxRecords: z.number().optional().describe("Maximum number of records to return (default: 100)"),
        includePrivileges: z.boolean().optional().describe("Include privilege details for each role (default: false)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roles: z.any(),
      }),
    },
    async ({ solutionUniqueName, excludeSystemRoles, maxRecords, includePrivileges, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        const result = await service.getSecurityRoles({ solutionUniqueName, excludeSystemRoles, maxRecords, includePrivileges });

        return {
          structuredContent: { roles: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} security roles:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting security roles:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get security roles: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Security Role Privileges
  server.registerTool(
    "get-security-role-privileges",
    {
      title: "Get Security Role Privileges",
      description: "Get privileges assigned to a specific security role, optionally filtered by entity or access right",
      inputSchema: {
        roleId: z.string().describe("The security role ID (GUID)"),
        entityFilter: z.string().optional().describe("Filter privileges by entity name (contains match)"),
        accessRightFilter: z.string().optional().describe("Filter privileges by access right (e.g., Read, Write, Create, Delete)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roleId: z.string(),
        privileges: z.any(),
      }),
    },
    async ({ roleId, entityFilter, accessRightFilter, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        const result = await service.getSecurityRolePrivileges(roleId, { entityFilter, accessRightFilter });

        return {
          structuredContent: { roleId, privileges: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} privileges for role ${roleId}:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting security role privileges:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get security role privileges: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
