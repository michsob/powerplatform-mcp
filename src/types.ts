import type { EntityService } from "./services/entity-service.js";
import type { RecordService } from "./services/record-service.js";
import type { OptionSetService } from "./services/optionset-service.js";
import type { PluginService } from "./services/plugin-service.js";
import type { DependencyService } from "./services/dependency-service.js";
import type { BusinessRuleService } from "./services/businessrule-service.js";
import type { FlowService } from "./services/flow-service.js";
import type { SolutionService } from "./services/solution-service.js";
import type { WorkflowService } from "./services/workflow-service.js";
import type { ConfigurationService } from "./services/configuration-service.js";
import type { SecurityRoleService } from "./services/security-role-service.js";
import type { ServiceEndpointService } from "./services/service-endpoint-service.js";
import type { CustomApiService } from "./services/customapi-service.js";
import type { WebResourceService } from "./services/webresource-service.js";

/**
 * Service context providing lazy-initialized service getters.
 * Used by tools and prompts to access PowerPlatform services.
 */
export interface ServiceContext {
  environmentName: string;
  getEntityService: () => EntityService;
  getRecordService: () => RecordService;
  getOptionSetService: () => OptionSetService;
  getPluginService: () => PluginService;
  getDependencyService: () => DependencyService;
  getBusinessRuleService: () => BusinessRuleService;
  getFlowService: () => FlowService;
  getSolutionService: () => SolutionService;
  getWorkflowService: () => WorkflowService;
  getConfigurationService: () => ConfigurationService;
  getSecurityRoleService: () => SecurityRoleService;
  getServiceEndpointService: () => ServiceEndpointService;
  getCustomApiService: () => CustomApiService;
  getWebResourceService: () => WebResourceService;
}
