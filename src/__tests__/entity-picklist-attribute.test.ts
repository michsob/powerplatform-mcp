import { describe, it, expect } from 'vitest';
import { EntityService } from '../services/entity-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const attributes = "api/data/v9.2/EntityDefinitions(LogicalName='contoso_settings')/Attributes";

describe('EntityService.createPicklistAttribute', () => {
  it('binds a column to a global choice, with its default, in the solution', async () => {
    const calls: RecordedCall[] = [];
    const service = new EntityService(fakeClient([[
      "GlobalOptionSetDefinitions(Name='contoso_audience')", { MetadataId: '22222222-2222-2222-2222-222222222222' }]], calls));

    await service.createPicklistAttribute('contoso_settings', 'contoso_audience', 'Audience', [], 'None', 'Who it is for',
      1033, 'ContosoCore', { globalOptionSetName: 'contoso_audience', defaultValue: 3 });

    const post = calls.find((c) => c.method === 'POST');
    expect(post?.endpoint).toBe(attributes);
    expect(post?.headers).toEqual({ 'MSCRM.SolutionUniqueName': 'ContosoCore' });
    expect(post?.data).toMatchObject({
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: 'contoso_audience',
      'GlobalOptionSet@odata.bind': '/GlobalOptionSetDefinitions(22222222-2222-2222-2222-222222222222)',
      DefaultFormValue: 3,
      DisplayName: { LocalizedLabels: [{ Label: 'Audience', LanguageCode: 1033 }] },
    });
    expect(post?.data).not.toHaveProperty('OptionSet');
  });

  it('keeps a local choice as before, with no default unless asked', async () => {
    const calls: RecordedCall[] = [];
    const service = new EntityService(fakeClient([], calls));

    await service.createPicklistAttribute('contoso_settings', 'contoso_size', 'Size', [{ value: 1, label: 'Small' }]);

    const data = calls.find((c) => c.method === 'POST')?.data as Record<string, unknown>;
    expect(data.OptionSet).toMatchObject({ IsGlobal: false, OptionSetType: 'Picklist', Options: [{ Value: 1 }] });
    expect(data).not.toHaveProperty('GlobalOptionSet@odata.bind');
    expect(data).not.toHaveProperty('DefaultFormValue');
  });

  it('says so when the global choice does not exist', async () => {
    const service = new EntityService(fakeClient([["GlobalOptionSetDefinitions(Name='contoso_missing')", {}]]));

    await expect(service.createPicklistAttribute('contoso_settings', 'contoso_audience', 'Audience', [], 'None', undefined,
      1033, undefined, { globalOptionSetName: 'contoso_missing' })).rejects.toThrow(/'contoso_missing' was not found/);
  });

  it('refuses options of its own on a global choice, and a local choice without options', async () => {
    const service = new EntityService(fakeClient([]));

    await expect(service.createPicklistAttribute('contoso_settings', 'contoso_audience', 'Audience', [{ value: 1, label: 'A' }],
      'None', undefined, 1033, undefined, { globalOptionSetName: 'contoso_audience' })).rejects.toThrow(/no options of its own/);
    await expect(service.createPicklistAttribute('contoso_settings', 'contoso_size', 'Size', [])).rejects.toThrow(/at least one option/);
  });
});
