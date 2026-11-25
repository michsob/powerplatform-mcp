import type { Command } from 'commander';
import type { EnvironmentRegistry } from '../../environment-config.js';
import type { PowerPlatformClient } from '../../powerplatform-client.js';

/** The Dataverse user the client acts as: WhoAmI, then that user's name. */
async function dataverseUser(client: PowerPlatformClient): Promise<string> {
  const { UserId } = await client.get<{ UserId: string }>('api/data/v9.2/WhoAmI');
  const user = await client.get<{ fullname?: string; domainname?: string }>(
    `api/data/v9.2/systemusers(${UserId})?$select=fullname,domainname`,
  );
  const name = user.fullname || user.domainname || 'unnamed user';
  return `${name}${user.domainname && user.domainname !== name ? ` <${user.domainname}>` : ''} (${UserId})`;
}

export function registerAuthCommands(program: Command, registry: EnvironmentRegistry): void {
  program
    .command('login')
    .description('Sign in as yourself in the browser, for an environment with AUTH_METHOD=interactive. The sign-in is cached ' +
      'for later commands and for the MCP server; run again to sign in afresh or as another account')
    .action(async (_opts: unknown, command: Command) => {
      const environment = registry.getEnvironment(command.optsWithGlobals().env);
      const client = registry.getClient(environment.name);
      const { username } = await client.login();
      console.log(`Signed in to ${environment.name} (${client.organizationUrl}) as ${username}.`);
      console.log(`  Dataverse user: ${await dataverseUser(client)}`);
    });

  program
    .command('logout')
    .description('Forget the cached sign-in of an environment with AUTH_METHOD=interactive')
    .action(async (_opts: unknown, command: Command) => {
      const environment = registry.getEnvironment(command.optsWithGlobals().env);
      const removed = await registry.getClient(environment.name).logout();
      console.log(removed.length === 0
        ? `No cached sign-in for ${environment.name}.`
        : `Signed out of ${environment.name}: ${removed.join(', ')}.`);
    });

  program
    .command('whoami')
    .description('Show how an environment signs in and the Dataverse user it acts as')
    .action(async (_opts: unknown, command: Command) => {
      const environment = registry.getEnvironment(command.optsWithGlobals().env);
      const client = registry.getClient(environment.name);
      const how = environment.authMethod === 'interactive'
        ? `interactive${environment.email ? ` as ${environment.email}` : ''}`
        : `client secret of app ${environment.clientId}`;
      console.log(`${environment.name} (${client.organizationUrl}), signs in with ${how}.`);
      console.log(`  Dataverse user: ${await dataverseUser(client)}`);
    });
}
