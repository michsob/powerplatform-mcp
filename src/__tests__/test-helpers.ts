import { EnvironmentRegistry } from '../environment-config.js';

export function hasCredentials(): boolean {
  const envList = process.env.POWERPLATFORM_ENVIRONMENTS;
  if (!envList) return false;

  const firstName = envList.split(',')[0]?.trim();
  if (!firstName) return false;

  const prefix = `POWERPLATFORM_${firstName}`;
  return !!(
    process.env[`${prefix}_URL`] &&
    process.env[`${prefix}_CLIENT_ID`] &&
    process.env[`${prefix}_CLIENT_SECRET`] &&
    process.env[`${prefix}_TENANT_ID`]
  );
}

let sharedRegistry: EnvironmentRegistry | null = null;

function getRegistry(): EnvironmentRegistry {
  if (!sharedRegistry) {
    sharedRegistry = new EnvironmentRegistry();
  }
  return sharedRegistry;
}

export function createEntityService() { return getRegistry().getContext().getEntityService(); }
export function createRecordService() { return getRegistry().getContext().getRecordService(); }
export function createOptionSetService() { return getRegistry().getContext().getOptionSetService(); }
export function createPluginService() { return getRegistry().getContext().getPluginService(); }
export function createDependencyService() { return getRegistry().getContext().getDependencyService(); }
export function createBusinessRuleService() { return getRegistry().getContext().getBusinessRuleService(); }
export function createFlowService() { return getRegistry().getContext().getFlowService(); }
export function createSolutionService() { return getRegistry().getContext().getSolutionService(); }
export function createWorkflowService() { return getRegistry().getContext().getWorkflowService(); }
export function createConfigurationService() { return getRegistry().getContext().getConfigurationService(); }
export function createSecurityRoleService() { return getRegistry().getContext().getSecurityRoleService(); }
