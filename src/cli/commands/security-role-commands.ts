import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';

export function registerSecurityRoleCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('security-roles')
    .description('List security roles')
    .option('--solution <name>', 'Filter to roles in a specific solution')
    .option('--include-system', 'Include system roles (excluded by default)')
    .option('--include-privileges', 'Include privilege details for each role')
    .option('--max-records <n>', 'Maximum records to return', '100')
    .action(async (opts: { solution?: string; includeSystem?: boolean; includePrivileges?: boolean; maxRecords: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      const result = await service.getSecurityRoles({
        solutionUniqueName: opts.solution,
        excludeSystemRoles: !opts.includeSystem,
        maxRecords: parseInt(opts.maxRecords, 10),
        includePrivileges: opts.includePrivileges,
      });
      const roles = result.value || [];

      const nameList = roles
        .slice(0, 10)
        .map((r: Record<string, unknown>) => `${r.name} (managed: ${r.ismanaged})`)
        .join('\n    ');

      outputResult({
        fileName: 'security-roles',
        data: result,
        summary: [
          `Found ${roles.length} security roles:`,
          roles.length > 0 ? `  Roles:\n    ${nameList}${roles.length > 10 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('security-role-privileges <roleId>')
    .description('Get privileges for a security role')
    .option('--entity <name>', 'Filter by entity name')
    .option('--access-right <type>', 'Filter by access right (Read, Write, Create, Delete, etc.)')
    .action(async (roleId: string, opts: { entity?: string; accessRight?: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      const result = await service.getSecurityRolePrivileges(roleId, {
        entityFilter: opts.entity,
        accessRightFilter: opts.accessRight,
      });
      const privileges = result.value || [];

      const nameList = privileges
        .slice(0, 15)
        .map((p: Record<string, unknown>) => String(p.name))
        .join('\n    ');

      outputResult({
        fileName: `security-role-${roleId}-privileges`,
        data: result,
        summary: [
          `Found ${privileges.length} privileges for role ${roleId}:`,
          privileges.length > 0 ? `  Privileges:\n    ${nameList}${privileges.length > 15 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });
}
