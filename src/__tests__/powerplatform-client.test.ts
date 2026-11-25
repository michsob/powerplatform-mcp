import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Account = { username: string };
const { http, acquire, pca } = vi.hoisted(() => ({
  http: vi.fn(),
  acquire: vi.fn(),
  // The public client app's calls, its cached accounts and what it was built with.
  pca: { silent: vi.fn(), interactive: vi.fn(), accounts: [] as Account[], removed: [] as string[], configs: [] as unknown[] },
}));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: Object.assign(http, { isAxiosError: actual.default.isAxiosError }) };
});
vi.mock('@azure/msal-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@azure/msal-node')>();
  return {
    ...actual,
    ConfidentialClientApplication: class { acquireTokenByClientCredential = acquire; },
    PublicClientApplication: class {
      constructor(config: unknown) { pca.configs.push(config); }
      acquireTokenSilent = pca.silent;
      acquireTokenInteractive = pca.interactive;
      getTokenCache() {
        return {
          getAllAccounts: async () => pca.accounts,
          removeAccount: async (account: Account) => {
            pca.removed.push(account.username);
            pca.accounts = pca.accounts.filter((a) => a !== account);
          },
        };
      }
    },
  };
});

const { InteractionRequiredAuthError } = await import('@azure/msal-node');
const { AuthenticationError, DataverseRequestError, PowerPlatformClient, REQUEST_TIMEOUT_MS } = await import('../powerplatform-client.js');
const { InteractiveTokenSource } = await import('../auth/token-sources.js');

const config = { organizationUrl: 'https://org.example.crm.dynamics.com/', clientId: 'c', clientSecret: 's', tenantId: 't' };
const token = (value = 'secret-token') => ({ accessToken: value, expiresOn: new Date(Date.now() + 3600_000) });

function httpError(status: number | undefined, data: unknown, code?: string) {
  const request = { headers: new AxiosHeaders({ Authorization: 'Bearer secret-token' }), timeout: REQUEST_TIMEOUT_MS };
  return new AxiosError(
    status ? `Request failed with status code ${status}` : 'timeout exceeded', code, request as never, {},
    status ? { status, statusText: '', data, headers: {}, config: request as never } : undefined,
  );
}

beforeEach(() => {
  http.mockReset();
  acquire.mockReset();
  acquire.mockResolvedValue(token());
  pca.silent.mockReset();
  pca.interactive.mockReset();
  pca.accounts = [];
  pca.removed = [];
  pca.configs = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PowerPlatformClient requests', () => {
  it('drops a trailing slash from the organization URL, in requests and in the token scope', async () => {
    http.mockResolvedValue({ status: 200, data: { value: [] }, headers: {} });
    const client = new PowerPlatformClient(config);
    await client.get('api/data/v9.2/accounts');

    expect(client.organizationUrl).toBe('https://org.example.crm.dynamics.com');
    expect(http.mock.calls[0][0].url).toBe('https://org.example.crm.dynamics.com/api/data/v9.2/accounts');
    expect(acquire.mock.calls[0][0].scopes).toEqual(['https://org.example.crm.dynamics.com/.default']);
  });

  it('sets a timeout on every request', async () => {
    http.mockResolvedValue({ status: 204, data: undefined, headers: {} });
    const client = new PowerPlatformClient(config);
    await client.get('api/data/v9.2/accounts');
    await client.patch('api/data/v9.2/accounts(1)', { name: 'x' });
    await client.delete('api/data/v9.2/accounts(1)');
    expect(http.mock.calls.map((c) => c[0].timeout)).toEqual([REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS]);
  });

  it('keeps the HTTP status and Dataverse error code, and never the token', async () => {
    http.mockRejectedValue(httpError(404, { error: { code: '0x80040217', message: 'account With Id = 1 Does Not Exist' } }));
    const client = new PowerPlatformClient(config);

    const error = await client.get('api/data/v9.2/accounts(1)').catch((e) => e);
    expect(error).toBeInstanceOf(DataverseRequestError);
    expect(error).toMatchObject({ status: 404, code: '0x80040217', serviceMessage: 'account With Id = 1 Does Not Exist' });
    expect(error.message).toBe('PowerPlatform API request failed: 404 0x80040217: account With Id = 1 Does Not Exist');
    expect(JSON.stringify(error)).not.toContain('secret-token');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-token');
  });

  it('says a timed-out request had no response, for writes too', async () => {
    http.mockRejectedValue(httpError(undefined, undefined, 'ECONNABORTED'));
    const client = new PowerPlatformClient(config);
    await expect(client.post('api/data/v9.2/accounts', {})).rejects.toThrow(
      `PowerPlatform API POST request failed: no response within ${REQUEST_TIMEOUT_MS / 1000}s`,
    );
  });

  it('getAll follows nextLink through get', async () => {
    http
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { value: [1, 2], '@odata.nextLink': 'https://org.example.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=x' } })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { value: [3] } });
    const client = new PowerPlatformClient(config);
    expect(await client.getAll('api/data/v9.2/accounts', { pageSize: 2 })).toEqual({ value: [1, 2, 3], truncated: false });
    expect(http.mock.calls[1][0].url).toBe('https://org.example.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=x');
    expect(http.mock.calls[1][0].headers.Prefer).toBe('odata.maxpagesize=2');
  });

  it('flowApi calls the Flow API with the management token and keeps its error code', async () => {
    acquire.mockImplementation(async ({ scopes }: { scopes: string[] }) => token(scopes[0].includes('flow') ? 'flow-token' : 'dv-token'));
    http.mockRejectedValue(httpError(403, { error: { code: 'EnvironmentAccessDenied', message: 'Access to the environment is denied.' } }));
    const client = new PowerPlatformClient(config);

    const error = await client.flowApi('GET', 'providers/Microsoft.ProcessSimple/environments/e/flows/f').catch((e) => e);
    expect(http.mock.calls[0][0].url).toBe('https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/e/flows/f');
    expect(http.mock.calls[0][0].headers.Authorization).toBe('Bearer flow-token');
    expect(error).toMatchObject({ status: 403, code: 'EnvironmentAccessDenied' });
  });
});

describe('PowerPlatformClient authentication', () => {
  it('keeps the AADSTS reason instead of a bare "Authentication failed"', async () => {
    acquire.mockRejectedValue(Object.assign(new Error('x'), {
      errorCode: 'invalid_client',
      errorMessage: 'AADSTS7000215: Invalid client secret provided.\r\nTrace ID: 1\r\nCorrelation ID: 2',
    }));
    const client = new PowerPlatformClient(config);

    const error = await client.get('api/data/v9.2/accounts').catch((e) => e);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toBe('Authentication failed (invalid_client): AADSTS7000215: Invalid client secret provided.');
    expect(http).not.toHaveBeenCalled();
  });

  it('reuses a token until shortly before it expires', async () => {
    http.mockResolvedValue({ status: 200, data: {}, headers: {} });
    const client = new PowerPlatformClient(config);
    await client.get('a');
    await client.get('b');
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('needs a client secret unless the environment signs in interactively', () => {
    expect(() => new PowerPlatformClient({ ...config, clientSecret: undefined })).toThrow('A client secret is required');
  });
});

describe('PowerPlatformClient interactive sign-in', () => {
  const me = { username: 'Me@Example.com' };
  const interactive = {
    organizationUrl: 'https://org.example.crm.dynamics.com', clientId: 'public-client', tenantId: 'tenant',
    authMethod: 'interactive' as const, environmentName: 'CLIENTDEV', tokenCachePath: '/nonexistent/cache.json',
  };
  const signedIn = (value: string, account: Account = me) => ({ ...token(value), account });

  beforeEach(() => http.mockResolvedValue({ status: 200, data: {}, headers: {} }));

  it('signs in as a person to the tenant with the public client, its cache on disk', () => {
    new PowerPlatformClient(interactive);
    expect(pca.configs[0]).toMatchObject({
      auth: { clientId: 'public-client', authority: 'https://login.microsoftonline.com/tenant' },
      cache: { cachePlugin: expect.objectContaining({ beforeCacheAccess: expect.any(Function) }) },
    });
    expect(acquire).not.toHaveBeenCalled();
  });

  it('renews the token silently from the cached account, without the browser', async () => {
    pca.accounts = [me];
    pca.silent.mockResolvedValue(signedIn('cached-token'));
    const client = new PowerPlatformClient(interactive);
    await client.get('api/data/v9.2/WhoAmI');

    expect(pca.silent).toHaveBeenCalledWith({ account: me, scopes: ['https://org.example.crm.dynamics.com/.default'] });
    expect(pca.interactive).not.toHaveBeenCalled();
    expect(http.mock.calls[0][0].headers.Authorization).toBe('Bearer cached-token');
  });

  it('without a cached sign-in, the MCP server asks for `login` and sends nothing', async () => {
    const client = new PowerPlatformClient(interactive);
    const error = await client.get('api/data/v9.2/WhoAmI').catch((e) => e);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toBe('Not signed in to "CLIENTDEV": run `powerplatform-cli login --env CLIENTDEV` once; ' +
      'the CLI and the MCP server then use the cached sign-in.');
    expect(pca.interactive).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it('the CLI opens the browser when the cache cannot renew the token, hinting the configured account', async () => {
    pca.accounts = [me];
    pca.silent.mockRejectedValue(new InteractionRequiredAuthError('invalid_grant', 'AADSTS700082: The refresh token has expired'));
    pca.interactive.mockResolvedValue(signedIn('fresh-token'));
    const client = new PowerPlatformClient({ ...interactive, email: 'me@example.com', allowInteractive: true });
    await client.get('api/data/v9.2/WhoAmI');

    expect(pca.interactive.mock.calls[0][0]).toMatchObject({
      scopes: ['https://org.example.crm.dynamics.com/.default'], loginHint: 'me@example.com',
    });
    expect(pca.interactive.mock.calls[0][0].prompt).toBeUndefined();
    expect(http.mock.calls[0][0].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('with no account configured, the browser asks which account to use', async () => {
    pca.interactive.mockResolvedValue(signedIn('fresh-token'));
    await new PowerPlatformClient({ ...interactive, allowInteractive: true }).get('a');
    expect(pca.interactive.mock.calls[0][0]).toMatchObject({ prompt: 'select_account' });
    expect(pca.interactive.mock.calls[0][0].loginHint).toBeUndefined();
  });

  it('uses the configured account among several, and refuses to guess without one', async () => {
    const other = { username: 'other@example.com' };
    pca.accounts = [other, me];
    pca.silent.mockResolvedValue(signedIn('cached-token'));

    await new PowerPlatformClient({ ...interactive, email: 'me@example.com' }).get('a');
    expect(pca.silent.mock.calls[0][0].account).toBe(me);

    const error = await new PowerPlatformClient(interactive).get('a').catch((e) => e);
    expect(error.message).toBe('Several accounts are signed in for tenant tenant (other@example.com, Me@Example.com): ' +
      'set POWERPLATFORM_CLIENTDEV_EMAIL to the one "CLIENTDEV" uses.');
  });

  it('a silent failure that the browser cannot fix is reported, not turned into a sign-in', async () => {
    pca.accounts = [me];
    pca.silent.mockRejectedValue(Object.assign(new Error('x'), { errorCode: 'network_error', errorMessage: 'Network request failed' }));
    const error = await new PowerPlatformClient({ ...interactive, allowInteractive: true }).get('a').catch((e) => e);

    expect(error.message).toBe('Authentication failed (network_error): Network request failed');
    expect(pca.interactive).not.toHaveBeenCalled();
  });

  it('login signs in in the browser even with a cached token, and uses it for the next request', async () => {
    pca.accounts = [me];
    pca.silent.mockResolvedValue(signedIn('cached-token'));
    pca.interactive.mockResolvedValue(signedIn('login-token'));
    const client = new PowerPlatformClient(interactive);

    expect(await client.login()).toEqual({ username: 'Me@Example.com' });
    await client.get('api/data/v9.2/WhoAmI');
    expect(pca.silent).not.toHaveBeenCalled();
    expect(http.mock.calls[0][0].headers.Authorization).toBe('Bearer login-token');
  });

  it('logout forgets the configured account only', async () => {
    const other = { username: 'other@example.com' };
    pca.accounts = [other, me];
    expect(await new PowerPlatformClient({ ...interactive, email: 'me@example.com' }).logout()).toEqual(['Me@Example.com']);
    expect(pca.accounts).toEqual([other]);
  });

  it('login and logout are refused for an environment that signs in with a client secret', async () => {
    const client = new PowerPlatformClient(config);
    await expect(client.login()).rejects.toThrow('login applies to an environment that signs in interactively');
    await expect(client.logout()).rejects.toThrow('logout applies to an environment that signs in interactively');
  });
});

describe('InteractiveTokenSource', () => {
  const options = {
    environmentName: 'CLIENTDEV', tenantId: 'tenant', clientId: 'public-client',
    allowInteractive: true, tokenCachePath: '/nonexistent/cache.json',
  };

  it('prints the sign-in URL before opening the browser, so it can be opened by hand', async () => {
    const opened: string[] = [];
    pca.interactive.mockImplementation(async (request: { openBrowser: (url: string) => Promise<void> }) => {
      await request.openBrowser('https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize?x=1');
      return token('t');
    });
    await new InteractiveTokenSource({ ...options, openBrowser: async (url) => { opened.push(url); } }).signIn('scope/.default');

    expect(opened).toEqual(['https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize?x=1']);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n'))
      .toContain('If no browser opens, go to:\nhttps://login.microsoftonline.com/tenant/oauth2/v2.0/authorize?x=1');
  });

  it('gives up on a sign-in that does not finish', async () => {
    pca.interactive.mockReturnValue(new Promise(() => {}));
    const source = new InteractiveTokenSource({ ...options, signInTimeoutMs: 20 });
    await expect(source.signIn('scope/.default')).rejects.toThrow('Sign-in to "CLIENTDEV" did not finish within');
  });
});
