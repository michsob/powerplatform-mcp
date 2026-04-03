import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { registerEntityCommands } from './entity-commands.js';
import { registerPluginCommands } from './plugin-commands.js';
import { registerRecordCommands } from './record-commands.js';
import { registerFlowCommands } from './flow-commands.js';
import { registerSolutionCommands } from './solution-commands.js';
import { registerWorkflowCommands } from './workflow-commands.js';
import { registerBusinessRuleCommands } from './businessrule-commands.js';
import { registerOptionSetCommands } from './optionset-commands.js';
import { registerDependencyCommands } from './dependency-commands.js';
import { registerConfigurationCommands } from './configuration-commands.js';
import { registerSecurityRoleCommands } from './security-role-commands.js';
import { registerServiceEndpointCommands } from './service-endpoint-commands.js';

export function registerAllCommands(program: Command, registry: EnvironmentRegistry): void {
  registerEntityCommands(program, registry);
  registerPluginCommands(program, registry);
  registerRecordCommands(program, registry);
  registerFlowCommands(program, registry);
  registerSolutionCommands(program, registry);
  registerWorkflowCommands(program, registry);
  registerBusinessRuleCommands(program, registry);
  registerOptionSetCommands(program, registry);
  registerDependencyCommands(program, registry);
  registerConfigurationCommands(program, registry);
  registerSecurityRoleCommands(program, registry);
  registerServiceEndpointCommands(program, registry);
}
