/**
 * Test client factory for integration tests
 * Creates a real PowerPlatformClient authenticated via MSAL client credentials
 */

import { config } from 'dotenv';
import { PowerPlatformClient } from '../../src/PowerPlatformClient.js';

// Load environment variables
config();

// Singleton client instance
let clientInstance: PowerPlatformClient | null = null;

/**
 * Check if all required credentials are present in the environment
 */
export function hasCredentials(): boolean {
  return !!(
    process.env.POWERPLATFORM_URL &&
    process.env.POWERPLATFORM_CLIENT_ID &&
    process.env.POWERPLATFORM_CLIENT_SECRET &&
    process.env.POWERPLATFORM_TENANT_ID
  );
}

/**
 * Get a singleton PowerPlatformClient instance for tests
 * Throws if credentials are not available
 */
export function getTestClient(): PowerPlatformClient {
  if (!hasCredentials()) {
    throw new Error(
      'Missing required environment variables. Ensure POWERPLATFORM_URL, ' +
      'POWERPLATFORM_CLIENT_ID, POWERPLATFORM_CLIENT_SECRET, and ' +
      'POWERPLATFORM_TENANT_ID are set in .env'
    );
  }

  if (!clientInstance) {
    clientInstance = new PowerPlatformClient({
      organizationUrl: process.env.POWERPLATFORM_URL!,
      clientId: process.env.POWERPLATFORM_CLIENT_ID!,
      clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET!,
      tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      authorityUrl: process.env.POWERPLATFORM_AUTHORITY_URL,
    });
  }

  return clientInstance;
}

/**
 * Reset the client instance (useful for test isolation if needed)
 */
export function resetTestClient(): void {
  clientInstance = null;
}
