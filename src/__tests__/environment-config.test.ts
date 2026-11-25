import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentRegistry, loadEnvironments } from '../environment-config.js';
import { DEFAULT_INTERACTIVE_CLIENT_ID } from '../auth/token-sources.js';

const saved = { ...process.env };

function setEnv(values: Record<string, string>): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('POWERPLATFORM_')) delete process.env[key];
  }
  Object.assign(process.env, values);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
});

afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

const errors = () => vi.mocked(console.error).mock.calls.flat().join('\n');

describe('loadEnvironments', () => {
  it('signs in with a client secret by default, as before', () => {
    setEnv({
      POWERPLATFORM_ENVIRONMENTS: 'DEV',
      POWERPLATFORM_DEV_URL: 'https://dev.crm.dynamics.com',
      POWERPLATFORM_DEV_CLIENT_ID: 'app',
      POWERPLATFORM_DEV_CLIENT_SECRET: 'secret',
      POWERPLATFORM_DEV_TENANT_ID: 'tenant',
    });
    expect(loadEnvironments()).toEqual([{
      name: 'DEV', organizationUrl: 'https://dev.crm.dynamics.com', authMethod: 'client-secret',
      clientId: 'app', clientSecret: 'secret', tenantId: 'tenant',
    }]);
  });

  it('an interactive environment needs only its URL and tenant, and signs in with the public client', () => {
    setEnv({
      POWERPLATFORM_ENVIRONMENTS: 'CLIENTDEV',
      POWERPLATFORM_CLIENTDEV_AUTH_METHOD: 'Interactive',
      POWERPLATFORM_CLIENTDEV_URL: 'https://client-dev.crm.dynamics.com',
      POWERPLATFORM_CLIENTDEV_TENANT_ID: 'client-tenant',
      POWERPLATFORM_CLIENTDEV_EMAIL: 'me@example.com',
      POWERPLATFORM_CLIENTDEV_CLIENT_SECRET: 'left-over',
    });
    expect(loadEnvironments()).toEqual([{
      name: 'CLIENTDEV', organizationUrl: 'https://client-dev.crm.dynamics.com', authMethod: 'interactive',
      clientId: DEFAULT_INTERACTIVE_CLIENT_ID, tenantId: 'client-tenant', email: 'me@example.com',
    }]);
  });

  it('an interactive environment may name its own public client', () => {
    setEnv({
      POWERPLATFORM_ENVIRONMENTS: 'CLIENTDEV',
      POWERPLATFORM_CLIENTDEV_AUTH_METHOD: 'interactive',
      POWERPLATFORM_CLIENTDEV_URL: 'https://client-dev.crm.dynamics.com',
      POWERPLATFORM_CLIENTDEV_TENANT_ID: 'client-tenant',
      POWERPLATFORM_CLIENTDEV_CLIENT_ID: 'own-public-client',
    });
    expect(loadEnvironments()[0]).toMatchObject({ clientId: 'own-public-client', email: undefined });
  });

  it('an interactive environment still needs its tenant', () => {
    setEnv({
      POWERPLATFORM_ENVIRONMENTS: 'CLIENTDEV',
      POWERPLATFORM_CLIENTDEV_AUTH_METHOD: 'interactive',
      POWERPLATFORM_CLIENTDEV_URL: 'https://client-dev.crm.dynamics.com',
    });
    expect(() => loadEnvironments()).toThrow('exit 1');
    expect(errors()).toContain('Missing environment variables for "CLIENTDEV": POWERPLATFORM_CLIENTDEV_TENANT_ID');
  });

  it('refuses an unknown sign-in method', () => {
    setEnv({
      POWERPLATFORM_ENVIRONMENTS: 'DEV',
      POWERPLATFORM_DEV_AUTH_METHOD: 'device-code',
      POWERPLATFORM_DEV_URL: 'https://dev.crm.dynamics.com',
      POWERPLATFORM_DEV_TENANT_ID: 'tenant',
    });
    expect(() => loadEnvironments()).toThrow('exit 1');
    expect(errors()).toContain('POWERPLATFORM_DEV_AUTH_METHOD is "device-code"; expected client-secret or interactive.');
  });
});

describe('EnvironmentRegistry', () => {
  beforeEach(() => setEnv({
    POWERPLATFORM_ENVIRONMENTS: 'DEV,CLIENTDEV',
    POWERPLATFORM_DEV_URL: 'https://dev.crm.dynamics.com',
    POWERPLATFORM_DEV_CLIENT_ID: 'app',
    POWERPLATFORM_DEV_CLIENT_SECRET: 'secret',
    POWERPLATFORM_DEV_TENANT_ID: 'tenant',
    POWERPLATFORM_CLIENTDEV_AUTH_METHOD: 'interactive',
    POWERPLATFORM_CLIENTDEV_URL: 'https://client-dev.crm.dynamics.com/',
    POWERPLATFORM_CLIENTDEV_TENANT_ID: 'client-tenant',
  }));

  it('makes one client per environment, each with its sign-in method', () => {
    const registry = new EnvironmentRegistry();
    const personal = registry.getClient('CLIENTDEV');

    expect(personal.authMethod).toBe('interactive');
    expect(personal.organizationUrl).toBe('https://client-dev.crm.dynamics.com');
    expect(registry.getClient('CLIENTDEV')).toBe(personal);
    expect(registry.getClient().authMethod).toBe('client-secret');
  });

  it('names the environments it knows when asked for another', () => {
    expect(() => new EnvironmentRegistry().getEnvironment('PROD')).toThrow('Unknown environment "PROD". Available: DEV, CLIENTDEV');
  });
});
