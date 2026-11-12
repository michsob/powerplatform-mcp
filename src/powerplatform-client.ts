import { ConfidentialClientApplication } from '@azure/msal-node';
import axios, { type Method } from 'axios';
import { fetchAllPages, type FetchAllOptions } from './odata.js';

export interface PowerPlatformConfig {
  organizationUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

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

/** Token acquisition failed. The message carries MSAL's error code and the AADSTS reason. */
export class AuthenticationError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'AuthenticationError';
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

/** MSAL's error as text: its code and the first line of its message (the AADSTS reason). */
function authenticationError(what: string, error: unknown): AuthenticationError {
  const e = error as { errorCode?: unknown; errorMessage?: unknown; message?: unknown } | null;
  const code = typeof e?.errorCode === 'string' && e.errorCode ? e.errorCode : undefined;
  const text = typeof e?.errorMessage === 'string' && e.errorMessage ? e.errorMessage
    : typeof e?.message === 'string' ? e.message : String(error);
  const reason = text.split(/\r?\n/)[0].trim();
  return new AuthenticationError(`${what} failed${code ? ` (${code})` : ''}: ${reason}`, code);
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
  private msalClient: ConfidentialClientApplication;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;
  private managementAccessToken: string | null = null;
  private managementTokenExpirationTime: number = 0;

  constructor(config: PowerPlatformConfig) {
    // A trailing slash would produce `…//api/data` and a `…//.default` scope that Entra rejects.
    this.config = { ...config, organizationUrl: config.organizationUrl.trim().replace(/\/+$/, '') };

    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
      }
    });
  }

  /**
   * Get the organization URL (without a trailing slash)
   */
  get organizationUrl(): string {
    return this.config.organizationUrl;
  }

  /**
   * Get an access token for the PowerPlatform API
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpirationTime > Date.now()) {
      return this.accessToken;
    }

    let result;
    try {
      result = await this.msalClient.acquireTokenByClientCredential({
        scopes: [`${this.config.organizationUrl}/.default`],
      });
    } catch (error) {
      const failure = authenticationError('Authentication', error);
      console.error(failure.message);
      throw failure;
    }
    if (!result?.accessToken) {
      throw new AuthenticationError('Authentication failed: no access token was returned');
    }

    this.accessToken = result.accessToken;
    // Refresh 5 minutes early.
    this.tokenExpirationTime = result.expiresOn ? result.expiresOn.getTime() - 5 * 60 * 1000 : 0;
    return this.accessToken;
  }

  /**
   * Get an access token for the Flow Management API (api.flow.microsoft.com).
   * Uses a different scope than the Dataverse token.
   */
  async getManagementToken(): Promise<string> {
    if (this.managementAccessToken && this.managementTokenExpirationTime > Date.now()) {
      return this.managementAccessToken;
    }

    let result;
    try {
      result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://service.flow.microsoft.com/.default'],
      });
    } catch (error) {
      const failure = authenticationError('Management API authentication', error);
      console.error(failure.message);
      throw failure;
    }
    if (!result?.accessToken) {
      throw new AuthenticationError('Management API authentication failed: no access token was returned');
    }

    this.managementAccessToken = result.accessToken;
    this.managementTokenExpirationTime = result.expiresOn ? result.expiresOn.getTime() - 5 * 60 * 1000 : 0;
    return this.managementAccessToken;
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
