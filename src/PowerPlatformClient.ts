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
    } catch (error) {
      console.error('PowerPlatform API request failed:', error);
      throw new Error(`PowerPlatform API request failed: ${error}`);
    }
  }
}
