import { PowerPlatformClient } from './powerplatform-client.js';
import type { PowerPlatformConfig } from './powerplatform-client.js';
import {
  EntityService,
  RecordService,
  OptionSetService,
  PluginService,
  DependencyService,
  BusinessRuleService,
  FlowService,
  SolutionService,
  WorkflowService,
  ConfigurationService,
  SecurityRoleService,
  ServiceEndpointService,
  CustomApiService,
  WebResourceService,
} from './services/index.js';
import type { ServiceContext } from './types.js';

export interface EnvironmentConfig {
  name: string;
  organizationUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

/**
 * Parse POWERPLATFORM_ENVIRONMENTS and per-environment env vars.
 * Expects: POWERPLATFORM_ENVIRONMENTS=DEV,UAT
 * Then for each name: POWERPLATFORM_{NAME}_URL, _CLIENT_ID, _CLIENT_SECRET, _TENANT_ID
 */
export function loadEnvironments(): EnvironmentConfig[] {
  const envList = process.env.POWERPLATFORM_ENVIRONMENTS;
  if (!envList) {
    console.error('Error: Missing POWERPLATFORM_ENVIRONMENTS environment variable.');
    console.error('Set it to a comma-separated list of environment names, e.g. DEV,UAT');
    process.exit(1);
  }

  const names = envList.split(',').map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    console.error('Error: POWERPLATFORM_ENVIRONMENTS is empty.');
    process.exit(1);
  }

  const configs: EnvironmentConfig[] = [];
  for (const name of names) {
    const prefix = `POWERPLATFORM_${name}`;
    const missing: string[] = [];

    const url = process.env[`${prefix}_URL`];
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
    const tenantId = process.env[`${prefix}_TENANT_ID`];

    if (!url) missing.push(`${prefix}_URL`);
    if (!clientId) missing.push(`${prefix}_CLIENT_ID`);
    if (!clientSecret) missing.push(`${prefix}_CLIENT_SECRET`);
    if (!tenantId) missing.push(`${prefix}_TENANT_ID`);

    if (missing.length > 0) {
      console.error(`Error: Missing environment variables for "${name}": ${missing.join(', ')}`);
      process.exit(1);
    }

    configs.push({
      name,
      organizationUrl: url!,
      clientId: clientId!,
      clientSecret: clientSecret!,
      tenantId: tenantId!,
    });
  }

  return configs;
}

/**
 * Registry that manages per-environment PowerPlatform clients and service contexts.
 * Environment config is loaded lazily on first access so --help/--version work
 * without requiring environment variables to be set.
 */
export class EnvironmentRegistry {
  private configs: Map<string, EnvironmentConfig> | null = null;
  private contexts: Map<string, ServiceContext> = new Map();
  private defaultEnv: string | null = null;

  private ensureLoaded(): void {
    if (this.configs) return;
    const environments = loadEnvironments();
    this.configs = new Map(environments.map((e) => [e.name, e]));
    this.defaultEnv = environments[0].name;
  }

  getDefaultEnvironment(): string {
    this.ensureLoaded();
    return this.defaultEnv!;
  }

  getEnvironmentNames(): string[] {
    this.ensureLoaded();
    return [...this.configs!.keys()];
  }

  getContext(envName?: string): ServiceContext {
    this.ensureLoaded();
    const name = envName ?? this.defaultEnv!;
    const existing = this.contexts.get(name);
    if (existing) return existing;

    const config = this.configs!.get(name);
    if (!config) {
      const available = [...this.configs!.keys()].join(', ');
      throw new Error(`Unknown environment "${name}". Available: ${available}`);
    }

    const ppConfig: PowerPlatformConfig = {
      organizationUrl: config.organizationUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tenantId: config.tenantId,
    };

    let client: PowerPlatformClient | null = null;
    function getClient(): PowerPlatformClient {
      if (!client) {
        client = new PowerPlatformClient(ppConfig);
        console.error(`PowerPlatform client initialized for environment: ${name}`);
      }
      return client;
    }

    let entityService: EntityService | null = null;
    let recordService: RecordService | null = null;
    let optionSetService: OptionSetService | null = null;
    let pluginService: PluginService | null = null;
    let dependencyService: DependencyService | null = null;
    let businessRuleService: BusinessRuleService | null = null;
    let flowService: FlowService | null = null;
    let solutionService: SolutionService | null = null;
    let workflowService: WorkflowService | null = null;
    let configurationService: ConfigurationService | null = null;
    let securityRoleService: SecurityRoleService | null = null;
    let serviceEndpointService: ServiceEndpointService | null = null;
    let customApiService: CustomApiService | null = null;
    let webResourceService: WebResourceService | null = null;

    const ctx: ServiceContext = {
      environmentName: name,
      getEntityService: () => (entityService ??= new EntityService(getClient())),
      getRecordService: () => (recordService ??= new RecordService(getClient())),
      getOptionSetService: () => (optionSetService ??= new OptionSetService(getClient())),
      getPluginService: () => (pluginService ??= new PluginService(getClient())),
      getDependencyService: () => (dependencyService ??= new DependencyService(getClient())),
      getBusinessRuleService: () => (businessRuleService ??= new BusinessRuleService(getClient())),
      getFlowService: () => (flowService ??= new FlowService(getClient())),
      getSolutionService: () => (solutionService ??= new SolutionService(getClient())),
      getWorkflowService: () => (workflowService ??= new WorkflowService(getClient())),
      getConfigurationService: () => (configurationService ??= new ConfigurationService(getClient())),
      getSecurityRoleService: () => {
        const solutionSvc = (solutionService ??= new SolutionService(getClient()));
        return (securityRoleService ??= new SecurityRoleService(getClient(), solutionSvc));
      },
      getServiceEndpointService: () => (serviceEndpointService ??= new ServiceEndpointService(getClient())),
      getCustomApiService: () => (customApiService ??= new CustomApiService(getClient())),
      getWebResourceService: () => (webResourceService ??= new WebResourceService(getClient())),
    };

    this.contexts.set(name, ctx);
    return ctx;
  }
}
