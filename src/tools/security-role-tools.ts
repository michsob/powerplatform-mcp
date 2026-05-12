import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentRegistry } from "../environment-config.js";

const privilegeAssignmentSchema = z.object({
  privilegeId: z.string().describe("Privilege ID (GUID) — use list-privileges to discover values"),
  depth: z.enum(["Basic", "Local", "Deep", "Global"]).describe("Privilege depth: Basic=User, Local=BU, Deep=BU+child, Global=Org"),
  businessUnitId: z.string().optional().describe("Optional business unit ID for the privilege assignment"),
});

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

  // List Privileges (catalog)
  server.registerTool(
    "list-privileges",
    {
      title: "List Privileges",
      description: "List the system privilege catalog. Use to discover privilegeId GUIDs and supported depths before assigning privileges to a role.",
      inputSchema: {
        entityFilter: z.string().optional().describe("Filter by privilege name contains (Dataverse privileges are named prv{Action}{Entity}, e.g. prvReadAccount)"),
        accessRightFilter: z.string().optional().describe("Filter by access right (Read, Write, Create, Delete, Append, AppendTo, Assign, Share)"),
        maxRecords: z.number().optional().describe("Maximum records to return (default: 100)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        privileges: z.any(),
      }),
    },
    async ({ entityFilter, accessRightFilter, maxRecords, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        const result = await service.listPrivileges({ entityFilter, accessRightFilter, maxRecords });

        return {
          structuredContent: { privileges: result.value },
          content: [
            {
              type: "text",
              text: `Found ${result.value.length} privileges:\n\n${JSON.stringify(result.value, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error listing privileges:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to list privileges: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Create Security Role
  server.registerTool(
    "create-security-role",
    {
      title: "Create Security Role",
      description: "Create a new security role. If businessUnitId is omitted, the role is created in the root business unit. Pass solutionUniqueName to add it to a specific unmanaged solution in one step.",
      inputSchema: {
        name: z.string().describe("Role display name"),
        businessUnitId: z.string().optional().describe("Business unit ID (GUID). Defaults to the organization's root BU when omitted."),
        description: z.string().optional().describe("Optional role description"),
        solutionUniqueName: z.string().optional().describe("Solution unique name to land the role in (uses MSCRM.SolutionUniqueName header)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roleId: z.string(),
        name: z.string(),
      }),
    },
    async ({ name, businessUnitId, description, solutionUniqueName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        const result = await service.createSecurityRole({ name, businessUnitId, description, solutionUniqueName });

        return {
          structuredContent: { roleId: result.roleId, name },
          content: [
            {
              type: "text",
              text: `Created security role '${name}' (ID: ${result.roleId})${solutionUniqueName ? ` in solution '${solutionUniqueName}'` : ''}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating security role:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create security role: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Clone Security Role
  server.registerTool(
    "clone-security-role",
    {
      title: "Clone Security Role",
      description: "Clone an existing security role into a new role, copying its privileges. Uses CloneAsRole with a fallback to create-then-copy-privileges if the action is unavailable.",
      inputSchema: {
        sourceRoleId: z.string().describe("ID (GUID) of the role to clone from"),
        newName: z.string().optional().describe("Optional name for the new role (defaults to '<source> (copy)' on fallback path)"),
        targetBusinessUnitId: z.string().optional().describe("Business unit ID for the new role. Defaults to root BU."),
        solutionUniqueName: z.string().optional().describe("Solution unique name to land the new role in"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roleId: z.string(),
        sourceRoleId: z.string(),
      }),
    },
    async ({ sourceRoleId, newName, targetBusinessUnitId, solutionUniqueName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        const result = await service.cloneSecurityRole(sourceRoleId, { newName, targetBusinessUnitId, solutionUniqueName });

        return {
          structuredContent: { roleId: result.roleId, sourceRoleId },
          content: [
            {
              type: "text",
              text: `Cloned role ${sourceRoleId} → new role ${result.roleId}${newName ? ` ('${newName}')` : ''}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error cloning security role:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to clone security role: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Update Security Role
  server.registerTool(
    "update-security-role",
    {
      title: "Update Security Role",
      description: "Update properties of a security role (name, description, business unit). At least one field must be provided.",
      inputSchema: {
        roleId: z.string().describe("ID (GUID) of the role to update"),
        name: z.string().optional().describe("New role name"),
        description: z.string().optional().describe("New role description"),
        businessUnitId: z.string().optional().describe("New business unit ID to move the role to"),
        solutionUniqueName: z.string().optional().describe("Solution unique name (uses MSCRM.SolutionUniqueName header)"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roleId: z.string(),
      }),
    },
    async ({ roleId, name, description, businessUnitId, solutionUniqueName, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        await service.updateSecurityRole(roleId, { name, description, businessUnitId, solutionUniqueName });

        return {
          structuredContent: { roleId },
          content: [
            {
              type: "text",
              text: `Updated security role ${roleId}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error updating security role:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to update security role: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Security Role
  server.registerTool(
    "delete-security-role",
    {
      title: "Delete Security Role",
      description: "Delete a security role. Destructive — requires confirm: true to proceed.",
      inputSchema: {
        roleId: z.string().describe("ID (GUID) of the role to delete"),
        confirm: z.boolean().describe("Must be true to actually delete the role"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roleId: z.string(),
        deleted: z.boolean(),
      }),
    },
    async ({ roleId, confirm, environment }) => {
      try {
        if (confirm !== true) {
          return {
            structuredContent: { roleId, deleted: false },
            content: [
              {
                type: "text",
                text: `Refused to delete role ${roleId}: confirm must be set to true.`,
              },
            ],
          };
        }

        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        await service.deleteSecurityRole(roleId);

        return {
          structuredContent: { roleId, deleted: true },
          content: [
            {
              type: "text",
              text: `Deleted security role ${roleId}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error deleting security role:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to delete security role: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Add Security Role Privileges
  server.registerTool(
    "add-security-role-privileges",
    {
      title: "Add Security Role Privileges",
      description: "Append privileges to a security role using AddPrivilegesRole. Existing privileges are preserved.",
      inputSchema: {
        roleId: z.string().describe("ID (GUID) of the role"),
        privileges: z.array(privilegeAssignmentSchema).min(1).describe("Privileges to add"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roleId: z.string(),
        added: z.number(),
      }),
    },
    async ({ roleId, privileges, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        await service.addRolePrivileges(roleId, privileges);

        return {
          structuredContent: { roleId, added: privileges.length },
          content: [
            {
              type: "text",
              text: `Added ${privileges.length} privilege(s) to role ${roleId}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error adding role privileges:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to add role privileges: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Remove Security Role Privileges
  server.registerTool(
    "remove-security-role-privileges",
    {
      title: "Remove Security Role Privileges",
      description: "Remove privileges from a security role. Loops RemovePrivilegeRole — each privilege is removed in its own call.",
      inputSchema: {
        roleId: z.string().describe("ID (GUID) of the role"),
        privilegeIds: z.array(z.string()).min(1).describe("Privilege IDs (GUIDs) to remove"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roleId: z.string(),
        removed: z.number(),
      }),
    },
    async ({ roleId, privilegeIds, environment }) => {
      try {
        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        await service.removeRolePrivileges(roleId, privilegeIds);

        return {
          structuredContent: { roleId, removed: privilegeIds.length },
          content: [
            {
              type: "text",
              text: `Removed ${privilegeIds.length} privilege(s) from role ${roleId}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error removing role privileges:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to remove role privileges: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Replace Security Role Privileges
  server.registerTool(
    "replace-security-role-privileges",
    {
      title: "Replace Security Role Privileges",
      description: "Replace the entire set of privileges on a role with the supplied list (ReplacePrivilegesRole). Destructive — wipes existing privileges.",
      inputSchema: {
        roleId: z.string().describe("ID (GUID) of the role"),
        privileges: z.array(privilegeAssignmentSchema).describe("Full set of privileges to apply (existing ones are wiped)"),
        confirm: z.boolean().describe("Must be true to apply the destructive replace"),
        environment: z.string().optional().describe("Environment name (e.g. DEV, UAT). Uses default if omitted."),
      },
      outputSchema: z.object({
        roleId: z.string(),
        applied: z.number(),
        replaced: z.boolean(),
      }),
    },
    async ({ roleId, privileges, confirm, environment }) => {
      try {
        if (confirm !== true) {
          return {
            structuredContent: { roleId, applied: 0, replaced: false },
            content: [
              {
                type: "text",
                text: `Refused to replace privileges on role ${roleId}: confirm must be set to true.`,
              },
            ],
          };
        }

        const ctx = registry.getContext(environment);
        const service = ctx.getSecurityRoleService();
        await service.replaceRolePrivileges(roleId, privileges);

        return {
          structuredContent: { roleId, applied: privileges.length, replaced: true },
          content: [
            {
              type: "text",
              text: `Replaced privileges on role ${roleId} (${privileges.length} now applied)`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error replacing role privileges:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to replace role privileges: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
