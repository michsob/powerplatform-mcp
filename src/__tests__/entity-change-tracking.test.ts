import { describe, it, expect } from 'vitest';
import { EntityService } from '../services/entity-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const metadata = (enabled: boolean) => ({
  MetadataId: '11111111-1111-1111-1111-111111111111',
  LogicalName: 'contoso_visit',
  ChangeTrackingEnabled: enabled,
  DisplayName: { LocalizedLabels: [{ Label: 'Visit', LanguageCode: 1033 }] },
});

describe('EntityService.setChangeTracking', () => {
  it('puts the whole metadata back with change tracking on, keeping labels, in the solution', async () => {
    const calls: RecordedCall[] = [];
    const service = new EntityService(fakeClient([["EntityDefinitions(LogicalName='contoso_visit')", metadata(false)]], calls));

    const result = await service.setChangeTracking('contoso_visit', true, 'ContosoCore');

    expect(result).toEqual({ changed: true });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.endpoint).toBe('api/data/v9.2/EntityDefinitions(11111111-1111-1111-1111-111111111111)');
    expect(put?.data).toMatchObject({
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      LogicalName: 'contoso_visit',
      ChangeTrackingEnabled: true,
      DisplayName: { LocalizedLabels: [{ Label: 'Visit', LanguageCode: 1033 }] },
    });
    expect(put?.headers).toEqual({ 'MSCRM.MergeLabels': 'true', 'MSCRM.SolutionUniqueName': 'ContosoCore' });
  });

  it('writes nothing when the entity is already as asked', async () => {
    const calls: RecordedCall[] = [];
    const service = new EntityService(fakeClient([["EntityDefinitions(LogicalName='contoso_visit')", metadata(true)]], calls));

    const result = await service.setChangeTracking('contoso_visit', true);

    expect(result).toEqual({ changed: false });
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });

  it('turns it off', async () => {
    const calls: RecordedCall[] = [];
    const service = new EntityService(fakeClient([["EntityDefinitions(LogicalName='contoso_visit')", metadata(true)]], calls));

    await service.setChangeTracking('contoso_visit', false);

    expect(calls.find((c) => c.method === 'PUT')?.data).toMatchObject({ ChangeTrackingEnabled: false });
    expect(calls.find((c) => c.method === 'PUT')?.headers).toEqual({ 'MSCRM.MergeLabels': 'true' });
  });
});
