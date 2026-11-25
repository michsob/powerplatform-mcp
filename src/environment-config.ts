import { PowerPlatformClient } from './powerplatform-client.js';
import type { AuthMethod } from './powerplatform-client.js';
import { DEFAULT_INTERACTIVE_CLIENT_ID } from './auth/token-sources.js';
import {
  EntityService,
  FormViewService,
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
  ApplicationUserService,
  ModelDrivenAppService,
} from './services/index.js';
import type { ServiceContext } from './types.js';

export interface EnvironmentConfig {
  name: string;
  organizationUrl: string;
  authMethod: AuthMethod;
  clientId: string;
  /** Only for `client-secret`. */
  clientSecret?: string;
  tenantId: string;
  /** Only for `interactive`: the account to sign in with. */
  email?: string;
}

/**
 * Parse POWERPLATFORM_ENVIRONMENTS and per-environment env vars.
 * Expects: POWERPLATFORM_ENVIRONMENTS=DEV,UAT
 * Then for each name, by POWERPLATFORM_{NAME}_AUTH_METHOD:
 *   - client-secret (the default): _URL, _CLIENT_ID, _CLIENT_SECRET, _TENANT_ID
 *   - interactive: _URL, _TENANT_ID, and optionally _EMAIL and _CLIENT_ID (Microsoft's public client by default)
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

    const value = (suffix: string) => process.env[`${prefix}_${suffix}`]?.trim() || undefined;
    const authMethod = (value('AUTH_METHOD') ?? 'client-secret').toLowerCase();
    if (authMethod !== 'client-secret' && authMethod !== 'interactive') {
      console.error(`Error: ${prefix}_AUTH_METHOD is "${value('AUTH_METHOD')}"; expected client-secret or interactive.`);
      process.exit(1);
    }
    const interactive = authMethod === 'interactive';

    const url = value('URL');
    const clientId = value('CLIENT_ID') ?? (interactive ? DEFAULT_INTERACTIVE_CLIENT_ID : undefined);
    const clientSecret = value('CLIENT_SECRET');
    const tenantId = value('TENANT_ID');

    if (!url) missing.push(`${prefix}_URL`);
    if (!clientId) missing.push(`${prefix}_CLIENT_ID`);
    if (!interactive && !clientSecret) missing.push(`${prefix}_CLIENT_SECRET`);
    if (!tenantId) missing.push(`${prefix}_TENANT_ID`);

    if (missing.length > 0) {
      console.error(`Error: Missing environment variables for "${name}": ${missing.join(', ')}`);
      process.exit(1);
    }

    configs.push({
      name,
      organizationUrl: url!,
      authMethod,
      clientId: clientId!,
      // A person signs in as themselves: a secret left in the file is not used.
      ...(interactive ? { email: value('EMAIL') } : { clientSecret: clientSecret! }),
      tenantId: tenantId!,
    });
  }

  return configs;
}

export interface EnvironmentRegistryOptions {
  /**
   * Whether an interactive environment may open the browser when its cached sign-in is missing or expired.
   * The CLI does; the MCP server (the default) only uses the cache and asks for `powerplatform-cli login`.
   */
  allowInteractive?: boolean;
}

/**
 * Registry that manages per-environment PowerPlatform clients and service contexts.
 * Environment config is loaded lazily on first access so --help/--version work
 * without requiring environment variables to be set.
 */
export class EnvironmentRegistry {
  private configs: Map<string, EnvironmentConfig> | null = null;
  private contexts: Map<string, ServiceContext> = new Map();
  private clients: Map<string, PowerPlatformClient> = new Map();
  private defaultEnv: string | null = null;
  private readonly allowInteractive: boolean;

  constructor(options: EnvironmentRegistryOptions = {}) {
    this.allowInteractive = options.allowInteractive ?? false;
  }

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

  /** The environment's configuration (the default one without a name); throws for an unknown name. */
  getEnvironment(envName?: string): EnvironmentConfig {
    this.ensureLoaded();
    const name = envName ?? this.defaultEnv!;
    const config = this.configs!.get(name);
    if (!config) {
      const available = [...this.configs!.keys()].join(', ');
      throw new Error(`Unknown environment "${name}". Available: ${available}`);
    }
    return config;
  }

  /** The environment's client, made on first use. */
  getClient(envName?: string): PowerPlatformClient {
    const config = this.getEnvironment(envName);
    let client = this.clients.get(config.name);
    if (!client) {
      client = new PowerPlatformClient({
        organizationUrl: config.organizationUrl,
        authMethod: config.authMethod,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tenantId: config.tenantId,
        email: config.email,
        allowInteractive: this.allowInteractive,
        environmentName: config.name,
      });
      this.clients.set(config.name, client);
      console.error(`PowerPlatform client initialized for environment: ${config.name}`);
    }
    return client;
  }

  getContext(envName?: string): ServiceContext {
    const name = this.getEnvironment(envName).name;
    const existing = this.contexts.get(name);
    if (existing) return existing;

    const getClient = () => this.getClient(name);

    let entityService: EntityService | null = null;
    let formViewService: FormViewService | null = null;
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
    let applicationUserService: ApplicationUserService | null = null;
    let modelDrivenAppService: ModelDrivenAppService | null = null;

    const ctx: ServiceContext = {
      environmentName: name,
      getEntityService: () => (entityService ??= new EntityService(getClient())),
      getFormViewService: () => (formViewService ??= new FormViewService(getClient())),
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
      getApplicationUserService: () => (applicationUserService ??= new ApplicationUserService(getClient())),
      getModelDrivenAppService: () => (modelDrivenAppService ??= new ModelDrivenAppService(getClient())),
    };

    this.contexts.set(name, ctx);
    return ctx;
  }
}
