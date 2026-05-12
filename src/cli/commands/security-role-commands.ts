import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';
import type { PrivilegeAssignment, PrivilegeDepth } from '../../services/security-role-service.js';

const DEPTHS: ReadonlyArray<PrivilegeDepth> = ['Basic', 'Local', 'Deep', 'Global'];

function parsePrivilegesArg(raw: string): PrivilegeAssignment[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err: any) {
      throw new Error(`--privileges JSON could not be parsed: ${err.message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error('--privileges JSON must be an array');
    }
    return parsed.map((item, idx) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`--privileges[${idx}] must be an object`);
      }
      const obj = item as Record<string, unknown>;
      const privilegeId = typeof obj.privilegeId === 'string' ? obj.privilegeId : null;
      const depth = obj.depth as PrivilegeDepth | undefined;
      if (!privilegeId) throw new Error(`--privileges[${idx}].privilegeId is required`);
      if (!depth || !DEPTHS.includes(depth)) {
        throw new Error(`--privileges[${idx}].depth must be one of ${DEPTHS.join(', ')}`);
      }
      const businessUnitId = typeof obj.businessUnitId === 'string' ? obj.businessUnitId : undefined;
      return { privilegeId, depth, businessUnitId };
    });
  }

  // Shorthand: "<guid>:<Depth>,<guid>:<Depth>"
  return trimmed.split(',').map((token, idx) => {
    const [privilegeId, depth] = token.split(':').map((s) => s.trim());
    if (!privilegeId) throw new Error(`--privileges token #${idx + 1} is missing a privilegeId`);
    if (!depth || !DEPTHS.includes(depth as PrivilegeDepth)) {
      throw new Error(`--privileges token #${idx + 1} depth must be one of ${DEPTHS.join(', ')}`);
    }
    return { privilegeId, depth: depth as PrivilegeDepth };
  });
}

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

  program
    .command('privileges')
    .description('List the system privilege catalog (use to discover privilegeId values)')
    .option('--entity <name>', 'Filter by privilege name contains (e.g. Account)')
    .option('--access-right <type>', 'Filter by access right (Read, Write, Create, Delete, Append, AppendTo, Assign, Share)')
    .option('--max-records <n>', 'Maximum records to return', '100')
    .action(async (opts: { entity?: string; accessRight?: string; maxRecords: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      const result = await service.listPrivileges({
        entityFilter: opts.entity,
        accessRightFilter: opts.accessRight,
        maxRecords: parseInt(opts.maxRecords, 10),
      });
      const privileges = result.value || [];

      const nameList = privileges
        .slice(0, 20)
        .map((p: Record<string, unknown>) => `${p.name} (${p.privilegeid})`)
        .join('\n    ');

      outputResult({
        fileName: 'privileges',
        data: result,
        summary: [
          `Found ${privileges.length} privileges:`,
          privileges.length > 0 ? `  Sample:\n    ${nameList}${privileges.length > 20 ? '\n    ...' : ''}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-security-role')
    .description('Create a new security role')
    .requiredOption('--name <name>', 'Role display name')
    .option('--bu <id>', 'Business unit ID (defaults to root BU)')
    .option('--description <desc>', 'Role description')
    .option('--solution <name>', 'Solution unique name (uses MSCRM.SolutionUniqueName so no separate add-solution-component is needed)')
    .action(async (opts: { name: string; bu?: string; description?: string; solution?: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      const result = await service.createSecurityRole({
        name: opts.name,
        businessUnitId: opts.bu,
        description: opts.description,
        solutionUniqueName: opts.solution,
      });

      outputResult({
        fileName: `create-security-role-${opts.name.replace(/\s+/g, '-').toLowerCase()}`,
        data: result,
        summary: [
          `Created security role:`,
          `  Name: ${opts.name}`,
          opts.solution ? `  Solution: ${opts.solution}` : '',
          `  Role ID: ${result.roleId}`,
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('clone-security-role <sourceRoleId>')
    .description('Clone an existing security role (uses CloneAsRole; falls back to create-then-copy)')
    .option('--name <name>', 'Name for the new role')
    .option('--target-bu <id>', 'Target business unit ID (defaults to root BU)')
    .option('--solution <name>', 'Solution unique name to add the new role to')
    .action(async (sourceRoleId: string, opts: { name?: string; targetBu?: string; solution?: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      const result = await service.cloneSecurityRole(sourceRoleId, {
        newName: opts.name,
        targetBusinessUnitId: opts.targetBu,
        solutionUniqueName: opts.solution,
      });

      outputResult({
        fileName: `clone-security-role-${result.roleId}`,
        data: result,
        summary: [
          `Cloned security role:`,
          `  Source Role ID: ${sourceRoleId}`,
          `  New Role ID: ${result.roleId}`,
          opts.name ? `  Name: ${opts.name}` : '',
          opts.solution ? `  Solution: ${opts.solution}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('update-security-role <roleId>')
    .description('Update a security role (name, description, business unit)')
    .option('--name <name>', 'New role name')
    .option('--description <desc>', 'New role description')
    .option('--bu <id>', 'New business unit ID')
    .option('--solution <name>', 'Solution unique name (MSCRM.SolutionUniqueName)')
    .action(async (roleId: string, opts: { name?: string; description?: string; bu?: string; solution?: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      await service.updateSecurityRole(roleId, {
        name: opts.name,
        description: opts.description,
        businessUnitId: opts.bu,
        solutionUniqueName: opts.solution,
      });

      outputResult({
        fileName: `update-security-role-${roleId}`,
        data: { roleId, ...opts },
        summary: [
          `Updated security role:`,
          `  Role ID: ${roleId}`,
          opts.name ? `  Name: ${opts.name}` : '',
          opts.description ? `  Description: ${opts.description}` : '',
          opts.bu ? `  Business Unit: ${opts.bu}` : '',
        ].filter(Boolean).join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('delete-security-role <roleId>')
    .description('Delete a security role (destructive — requires --yes)')
    .option('--yes', 'Confirm the deletion')
    .action(async (roleId: string, opts: { yes?: boolean }, command: Command) => {
      if (!opts.yes) {
        console.error(`Refused to delete role ${roleId}: pass --yes to confirm.`);
        process.exitCode = 1;
        return;
      }
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      await service.deleteSecurityRole(roleId);
      console.log(`Deleted security role ${roleId}`);
    });

  program
    .command('add-role-privileges <roleId>')
    .description("Add privileges to a role (additive). --privileges accepts JSON array or shorthand '<guid>:<Depth>,<guid>:<Depth>'.")
    .requiredOption('--privileges <spec>', 'JSON array [{privilegeId,depth,businessUnitId?}] or shorthand <guid>:<Basic|Local|Deep|Global>,...')
    .action(async (roleId: string, opts: { privileges: string }, command: Command) => {
      const privileges = parsePrivilegesArg(opts.privileges);
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      await service.addRolePrivileges(roleId, privileges);

      outputResult({
        fileName: `add-role-privileges-${roleId}`,
        data: { roleId, added: privileges },
        summary: [
          `Added ${privileges.length} privilege(s) to role ${roleId}:`,
          `  ${privileges.map((p) => `${p.privilegeId}:${p.depth}`).join('\n  ')}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('remove-role-privileges <roleId>')
    .description('Remove privileges from a role')
    .requiredOption('--privileges <ids>', 'Comma-separated privilegeId GUIDs to remove')
    .action(async (roleId: string, opts: { privileges: string }, command: Command) => {
      const privilegeIds = opts.privileges.split(',').map((s) => s.trim()).filter(Boolean);
      if (privilegeIds.length === 0) {
        throw new Error('--privileges must contain at least one privilegeId');
      }
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      await service.removeRolePrivileges(roleId, privilegeIds);

      outputResult({
        fileName: `remove-role-privileges-${roleId}`,
        data: { roleId, removed: privilegeIds },
        summary: [
          `Removed ${privilegeIds.length} privilege(s) from role ${roleId}:`,
          `  ${privilegeIds.join('\n  ')}`,
        ].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('replace-role-privileges <roleId>')
    .description('Replace the full set of privileges on a role (destructive — requires --yes)')
    .requiredOption('--privileges <spec>', "JSON array [{privilegeId,depth,businessUnitId?}] or shorthand <guid>:<Basic|Local|Deep|Global>,... (use '[]' to clear)")
    .option('--yes', 'Confirm the destructive replace')
    .action(async (roleId: string, opts: { privileges: string; yes?: boolean }, command: Command) => {
      if (!opts.yes) {
        console.error(`Refused to replace privileges on role ${roleId}: pass --yes to confirm.`);
        process.exitCode = 1;
        return;
      }
      const privileges = parsePrivilegesArg(opts.privileges);
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const service = ctx.getSecurityRoleService();
      await service.replaceRolePrivileges(roleId, privileges);

      outputResult({
        fileName: `replace-role-privileges-${roleId}`,
        data: { roleId, applied: privileges },
        summary: [
          `Replaced privileges on role ${roleId} (${privileges.length} now applied):`,
          privileges.length > 0 ? `  ${privileges.map((p) => `${p.privilegeId}:${p.depth}`).join('\n  ')}` : '  (none)',
        ].join('\n'),
      }, ctx.environmentName);
    });
}
