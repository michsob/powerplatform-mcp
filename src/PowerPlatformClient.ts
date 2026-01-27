import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

export interface PowerPlatformConfig {
  organizationUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
  authorityUrl?: string; // Optional: Custom authority URL for national clouds (e.g., https://login.microsoftonline.us for GCC High)
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

  constructor(config: PowerPlatformConfig) {
    this.config = config;

    // Initialize MSAL client
    // Use custom authority URL if provided (for national clouds), otherwise use default
    const authorityBaseUrl = this.config.authorityUrl || 'https://login.microsoftonline.com';
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: `${authorityBaseUrl}/${this.config.tenantId}`,
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
      const errorMessage = error.response?.data?.error?.message || error.message || String(error);
      console.error('PowerPlatform API request failed:', errorMessage);
      throw new Error(`PowerPlatform API request failed: ${errorMessage}`);
    }
  }

  /**
   * Additional headers for customization requests
   */
  private buildHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      ...extraHeaders
    };
  }

  /**
   * Make an authenticated POST request to the PowerPlatform API
   * @param endpoint The API endpoint (relative to organization URL)
   * @param data The request body
   * @param extraHeaders Additional headers (e.g., MSCRM.SolutionUniqueName)
   */
  async post<T>(endpoint: string, data?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    try {
      const token = await this.getAccessToken();

      const response = await axios({
        method: 'POST',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          ...this.buildHeaders(extraHeaders)
        },
        data
      });

      // For metadata creation, extract ID from OData-EntityId header if body is empty
      if (!response.data || Object.keys(response.data).length === 0) {
        const entityIdHeader = response.headers['odata-entityid'];
        if (entityIdHeader) {
          // Extract GUID from header like: https://org.crm.dynamics.com/api/data/v9.2/EntityDefinitions(guid)
          const match = entityIdHeader.match(/\(([^)]+)\)$/);
          if (match) {
            return { MetadataId: match[1] } as T;
          }
        }
      }

      return response.data as T;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || String(error);
      console.error('PowerPlatform API POST request failed:', errorMessage);
      throw new Error(`PowerPlatform API POST request failed: ${errorMessage}`);
    }
  }

  /**
   * Make an authenticated PUT request to the PowerPlatform API
   * @param endpoint The API endpoint (relative to organization URL)
   * @param data The request body
   * @param extraHeaders Additional headers (e.g., MSCRM.MergeLabels)
   */
  async put<T>(endpoint: string, data: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    try {
      const token = await this.getAccessToken();

      const response = await axios({
        method: 'PUT',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          ...this.buildHeaders(extraHeaders)
        },
        data
      });

      return response.data as T;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || String(error);
      console.error('PowerPlatform API PUT request failed:', errorMessage);
      throw new Error(`PowerPlatform API PUT request failed: ${errorMessage}`);
    }
  }

  /**
   * Make an authenticated PATCH request to the PowerPlatform API
   * @param endpoint The API endpoint (relative to organization URL)
   * @param data The request body
   * @param extraHeaders Additional headers (e.g., MSCRM.SolutionUniqueName)
   */
  async patch<T>(endpoint: string, data: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    try {
      const token = await this.getAccessToken();

      const response = await axios({
        method: 'PATCH',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          ...this.buildHeaders(extraHeaders)
        },
        data
      });

      return response.data as T;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || String(error);
      console.error('PowerPlatform API PATCH request failed:', errorMessage);
      throw new Error(`PowerPlatform API PATCH request failed: ${errorMessage}`);
    }
  }

  /**
   * Make an authenticated DELETE request to the PowerPlatform API
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
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        }
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || String(error);
      console.error('PowerPlatform API DELETE request failed:', errorMessage);
      throw new Error(`PowerPlatform API DELETE request failed: ${errorMessage}`);
    }
  }
}
