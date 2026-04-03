import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnvironmentRegistry } from "../environment-config.js";
import { registerEntityTools } from "./entity-tools.js";
import { registerRecordTools } from "./record-tools.js";
import { registerOptionSetTools } from "./optionset-tools.js";
import { registerPluginTools } from "./plugin-tools.js";
import { registerDependencyTools } from "./dependency-tools.js";
import { registerBusinessRuleTools } from "./businessrule-tools.js";
import { registerFlowTools } from "./flow-tools.js";
import { registerSolutionTools } from "./solution-tools.js";
import { registerWorkflowTools } from "./workflow-tools.js";
import { registerConfigurationTools } from "./configuration-tools.js";
import { registerSecurityRoleTools } from "./security-role-tools.js";
import { registerServiceEndpointTools } from "./service-endpoint-tools.js";

export { registerEntityTools } from "./entity-tools.js";
export { registerRecordTools } from "./record-tools.js";
export { registerOptionSetTools } from "./optionset-tools.js";
export { registerPluginTools } from "./plugin-tools.js";
export { registerDependencyTools } from "./dependency-tools.js";
export { registerBusinessRuleTools } from "./businessrule-tools.js";
export { registerFlowTools } from "./flow-tools.js";
export { registerSolutionTools } from "./solution-tools.js";
export { registerWorkflowTools } from "./workflow-tools.js";
export { registerConfigurationTools } from "./configuration-tools.js";
export { registerSecurityRoleTools } from "./security-role-tools.js";
export { registerServiceEndpointTools } from "./service-endpoint-tools.js";

/**
 * Register all tools with the MCP server.
 */
export function registerAllTools(server: McpServer, registry: EnvironmentRegistry): void {
  registerEntityTools(server, registry);
  registerRecordTools(server, registry);
  registerOptionSetTools(server, registry);
  registerPluginTools(server, registry);
  registerDependencyTools(server, registry);
  registerBusinessRuleTools(server, registry);
  registerFlowTools(server, registry);
  registerSolutionTools(server, registry);
  registerWorkflowTools(server, registry);
  registerConfigurationTools(server, registry);
  registerSecurityRoleTools(server, registry);
  registerServiceEndpointTools(server, registry);
}
