/**
 * Constants for integration tests
 * Well-known entities that exist in any Dataverse environment
 */

/**
 * Well-known entities that exist in every Dataverse environment
 */
export const WELL_KNOWN_ENTITIES = {
  ACCOUNT: 'account',
  CONTACT: 'contact',
  LEAD: 'lead',
  SYSTEMUSER: 'systemuser',
  BUSINESSUNIT: 'businessunit',
  TEAM: 'team',
} as const;

/**
 * Plural names for API collection endpoints
 */
export const ENTITY_PLURAL_NAMES = {
  account: 'accounts',
  contact: 'contacts',
  lead: 'leads',
  systemuser: 'systemusers',
  businessunit: 'businessunits',
  team: 'teams',
} as const;

/**
 * Prefix for test-created data (for identification and cleanup)
 */
export const TEST_PREFIX = 'zzz_';

/**
 * Generate a unique test name with timestamp
 */
export function generateTestName(base: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${TEST_PREFIX}${base}_${timestamp}_${random}`;
}
