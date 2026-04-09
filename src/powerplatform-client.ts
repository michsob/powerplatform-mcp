import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

export interface PowerPlatformConfig {
  organizationUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
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
    this.config = config;

    // Initialize MSAL client
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
      }
    });
  }

  /**
   * Get the organization URL
   */
  get organizationUrl(): string {
    return this.config.organizationUrl;
  }

  /**
   * Get an access token for the PowerPlatform API
   */
  private async getAccessToken(): Promise<string> {
    const currentTime = Date.now();

    // If we have a token that isn't expired, return it
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      // Get a new token
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: [`${this.config.organizationUrl}/.default`],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;

      // Set expiration time (subtract 5 minutes to refresh early)
      if (result.expiresOn) {
        this.tokenExpirationTime = result.expiresOn.getTime() - (5 * 60 * 1000);
      }

      return this.accessToken;
    } catch (error) {
      console.error('Error acquiring access token:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Get an access token for the Flow Management API (api.flow.microsoft.com).
   * Uses a different scope than the Dataverse token.
   */
  async getManagementToken(): Promise<string> {
    const currentTime = Date.now();

    if (this.managementAccessToken && this.managementTokenExpirationTime > currentTime) {
      return this.managementAccessToken;
    }

    try {
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://service.flow.microsoft.com/.default'],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire management access token');
      }

      this.managementAccessToken = result.accessToken;

      if (result.expiresOn) {
        this.managementTokenExpirationTime = result.expiresOn.getTime() - (5 * 60 * 1000);
      }

      return this.managementAccessToken;
    } catch (error) {
      console.error('Error acquiring management access token:', error);
      throw new Error('Management API authentication failed');
    }
  }

  /**
   * Make an authenticated GET request to the PowerPlatform API
   * @param endpoint The API endpoint (relative to organization URL)
   */
  async get<T>(endpoint: string): Promise<T> {
    try {
      const token = await this.getAccessToken();

      const response = await axios({
        method: 'GET',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        }
      });

      return response.data as T;
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message ?? error?.message ?? error;
      console.error('PowerPlatform API request failed:', detail);
      throw new Error(`PowerPlatform API request failed: ${detail}`);
    }
  }

  /**
   * Make an authenticated POST request to the PowerPlatform API.
   * Handles Dataverse 204 responses by extracting the record ID from
   * the OData-EntityId header when available.
   * @param endpoint The API endpoint (relative to organization URL)
   * @param data The request body
   */
  async post<T>(endpoint: string, data?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    try {
      const token = await this.getAccessToken();

      const response = await axios({
        method: 'POST',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          ...extraHeaders,
        },
        data,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      if (response.status === 204) {
        const entityIdHeader = response.headers['odata-entityid'] as string | undefined;
        if (entityIdHeader) {
          const match = entityIdHeader.match(/\(([^)]+)\)/);
          return { entityId: match ? match[1] : entityIdHeader } as T;
        }
        return undefined as T;
      }

      return response.data as T;
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message ?? error?.message ?? error;
      console.error('PowerPlatform API POST request failed:', detail);
      throw new Error(`PowerPlatform API POST request failed: ${detail}`);
    }
  }

  /**
   * Make an authenticated PATCH request to the PowerPlatform API.
   * Used for update and upsert operations. Dataverse returns 204 No Content.
   * @param endpoint The API endpoint (relative to organization URL)
   * @param data The request body
   */
  async patch(endpoint: string, data?: unknown): Promise<void> {
    try {
      const token = await this.getAccessToken();

      await axios({
        method: 'PATCH',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        },
        data
      });
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message ?? error?.message ?? error;
      console.error('PowerPlatform API PATCH request failed:', detail);
      throw new Error(`PowerPlatform API PATCH request failed: ${detail}`);
    }
  }

  /**
   * Make an authenticated DELETE request to the PowerPlatform API.
   * Dataverse returns 204 No Content.
   * @param endpoint The API endpoint (relative to organization URL)
   */
  async delete(endpoint: string): Promise<void> {
    try {
      const token = await this.getAccessToken();

      await axios({
        method: 'DELETE',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        }
      });
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message ?? error?.message ?? error;
      console.error('PowerPlatform API DELETE request failed:', detail);
      throw new Error(`PowerPlatform API DELETE request failed: ${detail}`);
    }
  }
}
