import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { http, acquire } = vi.hoisted(() => ({ http: vi.fn(), acquire: vi.fn() }));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: Object.assign(http, { isAxiosError: actual.default.isAxiosError }) };
});
vi.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: class { acquireTokenByClientCredential = acquire; },
}));

const { AuthenticationError, DataverseRequestError, PowerPlatformClient, REQUEST_TIMEOUT_MS } = await import('../powerplatform-client.js');

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
});
