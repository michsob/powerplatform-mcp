import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createRecordService } from './test-helpers.js';
import type { RecordService } from '../services/record-service.js';

describe.skipIf(!hasCredentials())('RecordService (integration)', () => {
  let service: RecordService;

  beforeAll(() => {
    service = createRecordService();
  });

  it('queryRecords returns accounts', async () => {
    const result = await service.queryRecords('accounts', "name ne null", 5);
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.length).toBeLessThanOrEqual(5);
  });

  it('getRecord returns a single account', async () => {
    // First query to get an ID
    const list = await service.queryRecords('accounts', "name ne null", 1);
    expect(list.value.length).toBeGreaterThan(0);

    const accountId = list.value[0].accountid;
    expect(accountId).toBeDefined();

    const record = await service.getRecord('accounts', accountId);
    expect(record).toBeDefined();
    expect(record.accountid).toBe(accountId);
  });
});
