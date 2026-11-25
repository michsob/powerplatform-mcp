import type { AuthenticationResult } from '@azure/msal-node';
import axios, { type Method } from 'axios';
import { AuthenticationError, authenticationError } from './auth/errors.js';
import { ClientSecretTokenSource, InteractiveTokenSource, type TokenSource } from './auth/token-sources.js';
import { fetchAllPages, type FetchAllOptions } from './odata.js';

export { AuthenticationError } from './auth/errors.js';

/** How a client signs in: as an app with its client secret, or as a person in the browser. */
export type AuthMethod = 'client-secret' | 'interactive';

export interface PowerPlatformConfig {
  organizationUrl: string;
  clientId: string;
  tenantId: string;
  /** Defaults to `client-secret`. */
  authMethod?: AuthMethod;
  /** The app's secret: required for `client-secret`. */
  clientSecret?: string;
  /** `interactive`: the account to sign in with (login hint, and which cached account to use). */
  email?: string;
  /** `interactive`: whether a token request may open the browser (the CLI) or must use the cache (the MCP server). */
  allowInteractive?: boolean;
  /** `interactive`: overrides the token cache file. */
  tokenCachePath?: string;
  /** The environment's name, for sign-in messages. */
  environmentName?: string;
}

const FLOW_SCOPE = 'https://service.flow.microsoft.com/.default';

/**
 * How long one request may take before it fails. Dataverse stops a query itself after about two
 * minutes; this only keeps a stalled connection from hanging the server or the CLI forever.
 */
export const REQUEST_TIMEOUT_MS = 300_000;

const FLOW_API_BASE = 'https://api.flow.microsoft.com';

/**
 * A failed Dataverse or Flow API request. Keeps the HTTP status and the service's error code,
 * so a caller can tell "not found" or "access denied" from an outage without parsing text.
 */
export class DataverseRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** The service's error code, e.g. `0x80040217` from Dataverse or `EnvironmentAccessDenied` from the Flow API. */
    readonly code?: string,
    /** The service's own error message. */
    readonly serviceMessage?: string,
  ) {
    super(message);
    this.name = 'DataverseRequestError';
  }
}

/**
 * A failed request as a `DataverseRequestError`. Built from the response, never from the axios
 * error object as a whole: that carries the request config, and with it the bearer token.
 */
function requestError(label: string, error: unknown): DataverseRequestError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data as { error?: { code?: unknown; message?: unknown } } | undefined;
    const code = typeof body?.error?.code === 'string' ? body.error.code : undefined;
    const serviceMessage = typeof body?.error?.message === 'string' ? body.error.message : undefined;
    const reason = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
      ? `no response within ${Math.round((error.config?.timeout ?? REQUEST_TIMEOUT_MS) / 1000)}s`
      : serviceMessage ?? error.message;
    const detail = status ? `${status}${code ? ` ${code}` : ''}: ${reason}` : reason;
    return new DataverseRequestError(`${label} failed: ${detail}`, status, code, serviceMessage);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new DataverseRequestError(`${label} failed: ${message}`);
}

interface SendOptions {
  method: Method;
  url: string;
  token: string;
  data?: unknown;
  headers?: Record<string, string>;
  label: string;
}

/**
 * Base client for PowerPlatform API access.
 * Handles authentication and generic HTTP requests.
 * Service classes should depend on this client via constructor injection.
 */
export class PowerPlatformClient {
  private config: PowerPlatformConfig;
  private tokenSource: TokenSource;
  /** Tokens per scope, each until 5 minutes before it expires. */
  private tokens = new Map<string, { accessToken: string; refreshAt: number }>();

  constructor(config: PowerPlatformConfig) {
    // A trailing slash would produce `…//api/data` and a `…//.default` scope that Entra rejects.
    this.config = { ...config, organizationUrl: config.organizationUrl.trim().replace(/\/+$/, '') };

    if (this.authMethod === 'interactive') {
      this.tokenSource = new InteractiveTokenSource({
        environmentName: config.environmentName ?? this.config.organizationUrl,
        tenantId: config.tenantId,
        clientId: config.clientId,
        email: config.email,
        allowInteractive: config.allowInteractive ?? false,
        tokenCachePath: config.tokenCachePath,
      });
    } else {
      if (!config.clientSecret) throw new Error('A client secret is required to sign in with authMethod client-secret');
      this.tokenSource = new ClientSecretTokenSource(config.tenantId, config.clientId, config.clientSecret);
    }
  }

  /**
   * Get the organization URL (without a trailing slash)
   */
  get organizationUrl(): string {
    return this.config.organizationUrl;
  }

  get authMethod(): AuthMethod {
    return this.config.authMethod ?? 'client-secret';
  }

  private get dataverseScope(): string {
    return `${this.config.organizationUrl}/.default`;
  }

  /**
   * Get an access token for the PowerPlatform API
   */
  private getAccessToken(): Promise<string> {
    return this.token(this.dataverseScope, 'Authentication');
  }

  /**
   * Get an access token for the Flow Management API (api.flow.microsoft.com).
   * Uses a different scope than the Dataverse token.
   */
  getManagementToken(): Promise<string> {
    return this.token(FLOW_SCOPE, 'Management API authentication');
  }

  private async token(scope: string, what: string): Promise<string> {
    const held = this.tokens.get(scope);
    if (held && held.refreshAt > Date.now()) return held.accessToken;

    let result: AuthenticationResult | null;
    try {
      result = await this.tokenSource.acquire(scope);
    } catch (error) {
      const failure = authenticationError(what, error);
      console.error(failure.message);
      throw failure;
    }
    return this.remember(scope, result, what);
  }

  private remember(scope: string, result: AuthenticationResult | null, what: string): string {
    if (!result?.accessToken) {
      throw new AuthenticationError(`${what} failed: no access token was returned`);
    }
    // Refresh 5 minutes early.
    this.tokens.set(scope, {
      accessToken: result.accessToken,
      refreshAt: result.expiresOn ? result.expiresOn.getTime() - 5 * 60 * 1000 : 0,
    });
    return result.accessToken;
  }

  /**
   * Sign in in the browser now (interactive environments only) and cache the sign-in for later commands and the
   * MCP server. Returns the account's user name.
   */
  async login(): Promise<{ username: string }> {
    const source = this.interactiveSource('login');
    let result: AuthenticationResult;
    try {
      result = await source.signIn(this.dataverseScope);
    } catch (error) {
      throw authenticationError('Sign-in', error);
    }
    this.remember(this.dataverseScope, result, 'Sign-in');
    return { username: result.account?.username ?? '' };
  }

  /** Forget the cached sign-in (interactive environments only). Returns the user names removed. */
  async logout(): Promise<string[]> {
    const removed = await this.interactiveSource('logout').signOut();
    this.tokens.clear();
    return removed;
  }

  private interactiveSource(action: string): InteractiveTokenSource {
    if (!(this.tokenSource instanceof InteractiveTokenSource)) {
      throw new Error(`${action} applies to an environment that signs in interactively (AUTH_METHOD=interactive); ` +
        `${this.config.environmentName ?? this.config.organizationUrl} signs in with a client secret`);
    }
    return this.tokenSource;
  }

  /** One HTTP request with the common headers and the timeout; failures become `DataverseRequestError`. */
  private async send<T>({ method, url, token, data, headers, label }: SendOptions) {
    try {
      return await axios<T>({
        method,
        url,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        data,
        timeout: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      const failure = requestError(label, error);
      console.error(failure.message);
      throw failure;
    }
  }

  private async dataverse<T>(method: Method, endpoint: string, data?: unknown, extraHeaders?: Record<string, string>) {
    const token = await this.getAccessToken();
    return this.send<T>({
      method,
      url: `${this.config.organizationUrl}/${endpoint}`,
      token,
      data,
      headers: { 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extraHeaders },
      label: `PowerPlatform API ${method === 'GET' ? '' : `${method} `}request`,
    });
  }

  /**
   * Make an authenticated GET request to the PowerPlatform API
   * @param endpoint The API endpoint (relative to organization URL)
   * @param extraHeaders Optional extra headers (e.g. `Prefer: odata.maxpagesize=500` for pagination)
   */
  async get<T>(endpoint: string, extraHeaders?: Record<string, string>): Promise<T> {
    const response = await this.dataverse<T>('GET', endpoint, undefined, extraHeaders);
    return response.data;
  }

  /**
   * GET every page of a collection, following `@odata.nextLink`, up to `maxRecords` rows.
   * The endpoint must not use `$top`, which suppresses the nextLink.
   */
  async getAll<T>(endpoint: string, options?: FetchAllOptions): Promise<{ value: T[]; truncated: boolean }> {
    return fetchAllPages<T>(this, endpoint, options);
  }

  /**
   * Make an authenticated POST request to the PowerPlatform API.
   * Handles Dataverse 204 responses by extracting the record ID from
   * the OData-EntityId header when available.
   * @param endpoint The API endpoint (relative to organization URL)
   * @param data The request body
   */
  async post<T>(endpoint: string, data?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const response = await this.dataverse<T>('POST', endpoint, data ?? {}, extraHeaders);

    if (response.status === 204) {
      const entityIdHeader = response.headers['odata-entityid'] as string | undefined;
      if (entityIdHeader) {
        const match = entityIdHeader.match(/\(([^)]+)\)/);
        return { entityId: match ? match[1] : entityIdHeader } as T;
      }
      return undefined as T;
    }

    return response.data;
  }

  /**
   * Make an authenticated PATCH request to the PowerPlatform API.
   * Used for update and upsert operations. Dataverse returns 204 No Content.
   * @param endpoint The API endpoint (relative to organization URL)
   * @param data The request body
   * @param extraHeaders Additional headers (e.g. MSCRM.SolutionUniqueName)
   */
  async patch(endpoint: string, data?: unknown, extraHeaders?: Record<string, string>): Promise<void> {
    await this.dataverse('PATCH', endpoint, data ?? {}, extraHeaders);
  }

  /**
   * Make an authenticated PUT request to the PowerPlatform API.
   * Required for metadata updates (EntityDefinitions etc.) — Dataverse treats metadata
   * PUT as a full-replace UpdateEntityRequest; partial PATCH is not supported.
   * @param endpoint The API endpoint (relative to organization URL)
   * @param data The full entity body
   * @param extraHeaders Additional headers (e.g. MSCRM.MergeLabels, MSCRM.SolutionUniqueName)
   */
  async put(endpoint: string, data?: unknown, extraHeaders?: Record<string, string>): Promise<void> {
    await this.dataverse('PUT', endpoint, data ?? {}, extraHeaders);
  }

  /**
   * Make an authenticated DELETE request to the PowerPlatform API.
   * Dataverse returns 204 No Content.
   * @param endpoint The API endpoint (relative to organization URL)
   */
  async delete(endpoint: string, extraHeaders?: Record<string, string>): Promise<void> {
    await this.dataverse('DELETE', endpoint, undefined, extraHeaders);
  }

  /**
   * Call the Flow Management API (api.flow.microsoft.com) with the management token.
   * @param method HTTP method
   * @param path Path and query after the host, e.g. `providers/Microsoft.ProcessSimple/environments/…`
   * @param data Request body (POST)
   */
  async flowApi<T>(method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
    const token = await this.getManagementToken();
    const response = await this.send<T>({
      method,
      url: `${FLOW_API_BASE}/${path.replace(/^\/+/, '')}`,
      token,
      data: method === 'POST' ? (data ?? {}) : undefined,
      label: 'Flow API request',
    });
    return response.data;
  }
}
