/**
 * Jest global setup for integration tests
 */

import { jest, beforeAll } from '@jest/globals';
import { config } from 'dotenv';
import { hasCredentials } from './__helpers__/testClient.js';

// Load environment variables from .env
config();

// Set longer timeout for API calls (30 seconds)
jest.setTimeout(30000);

// Skip all tests if credentials are not available
if (!hasCredentials()) {
  console.warn(
    '\n⚠️  Skipping integration tests: Missing required environment variables.\n' +
    '   Ensure the following are set in .env:\n' +
    '   - POWERPLATFORM_URL\n' +
    '   - POWERPLATFORM_CLIENT_ID\n' +
    '   - POWERPLATFORM_CLIENT_SECRET\n' +
    '   - POWERPLATFORM_TENANT_ID\n'
  );

  // This will cause all tests to be skipped
  beforeAll(() => {
    throw new Error('Integration tests require credentials. Set environment variables in .env');
  });
}
