/**
 * Test data management utilities
 * Tracks created records for cleanup in afterAll hooks
 */

import { getTestClient } from './testClient.js';

interface TrackedRecord {
  entityPluralName: string;
  recordId: string;
}

// Track created records for cleanup
const createdRecords: TrackedRecord[] = [];

/**
 * Create a test record and track it for cleanup
 */
export async function createTestRecord<T extends { [key: string]: unknown }>(
  entityPluralName: string,
  data: T
): Promise<string> {
  const client = getTestClient();

  const response = await client.post<{ [key: string]: unknown }>(
    `api/data/v9.2/${entityPluralName}`,
    data
  );

  // Extract the record ID from the response
  // The primary key is typically entityname + 'id', e.g., 'accountid'
  const entityName = entityPluralName.replace(/s$/, '').replace(/ie$/, 'y');
  const idField = `${entityName}id`;
  const recordId = response[idField] as string;

  if (recordId) {
    createdRecords.push({ entityPluralName, recordId });
  }

  return recordId;
}

/**
 * Track an existing record for cleanup (if created through other means)
 */
export function trackRecord(entityPluralName: string, recordId: string): void {
  createdRecords.push({ entityPluralName, recordId });
}

/**
 * Clean up all tracked test records
 * Call this in afterAll hooks
 */
export async function cleanupTestRecords(): Promise<void> {
  const client = getTestClient();

  // Delete in reverse order (in case of dependencies)
  const recordsToDelete = [...createdRecords].reverse();

  for (const record of recordsToDelete) {
    try {
      await client.delete(`api/data/v9.2/${record.entityPluralName}(${record.recordId})`);
    } catch (error) {
      // Log but don't fail on cleanup errors
      console.warn(`Failed to cleanup record ${record.entityPluralName}(${record.recordId}):`, error);
    }
  }

  // Clear the tracking array
  createdRecords.length = 0;
}

/**
 * Get the count of tracked records (for debugging)
 */
export function getTrackedRecordCount(): number {
  return createdRecords.length;
}
