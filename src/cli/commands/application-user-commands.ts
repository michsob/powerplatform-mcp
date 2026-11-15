import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import { outputResult } from '../output.js';
import type { ApplicationUser, ApplicationUserRole } from '../../services/application-user-service.js';

function roleList(roles: ApplicationUserRole[]): string {
  return roles.length === 0 ? 'none' : roles.map((r) => `${r.name} (${r.roleId})`).join(', ');
}

function userLines(user: ApplicationUser): string[] {
  return [
    `  Name: ${user.fullName}`,
    `  System user ID: ${user.systemUserId}`,
    `  Application ID: ${user.applicationId}`,
    `  Business unit: ${user.businessUnitId}`,
    user.isDisabled ? '  Disabled: yes' : '',
  ].filter(Boolean);
}

export function registerApplicationUserCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('application-user <applicationId>')
    .description('Show the application user of an app registration or managed identity (by its application/client id), with its roles; exits 1 when there is none')
    .action(async (applicationId: string, _opts: unknown, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const user = await ctx.getApplicationUserService().getApplicationUser(applicationId);
      if (!user) {
        console.log(`No application user for application id ${applicationId}.`);
        process.exitCode = 1;
        return;
      }

      outputResult({
        fileName: `application-user-${user.applicationId}`,
        data: user,
        summary: ['Application user:', ...userLines(user), `  Roles: ${roleList(user.roles)}`].join('\n'),
      }, ctx.environmentName);
    });

  program
    .command('create-application-user <applicationId>')
    .description(
      'Create the application user of an app registration or managed identity (by its application/client id) and give it ' +
      'security roles. Safe to run again: an existing user is kept and only the roles it lacks are added.',
    )
    .option('--role <idOrName>', "Security role id or name, in the user's business unit (repeatable)",
      (val: string, acc: string[]) => { acc.push(val); return acc; }, [] as string[])
    .option('--bu <id>', 'Business unit ID for a new user (defaults to root BU)')
    .action(async (applicationId: string, opts: { role: string[]; bu?: string }, command: Command) => {
      const ctx = registry.getContext(command.optsWithGlobals().env);
      const result = await ctx.getApplicationUserService().ensureApplicationUser(applicationId, {
        roles: opts.role,
        businessUnitId: opts.bu,
      });

      outputResult({
        fileName: `create-application-user-${result.user.applicationId}`,
        data: result,
        summary: [
          result.created ? 'Created application user:' : 'Application user already exists:',
          ...userLines(result.user),
          `  Roles added: ${roleList(result.rolesAdded)}`,
          `  Roles held: ${roleList(result.user.roles)}`,
        ].join('\n'),
      }, ctx.environmentName);
    });
}
