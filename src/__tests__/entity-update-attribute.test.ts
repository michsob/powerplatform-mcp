import { describe, it, expect } from 'vitest';
import { EntityService } from '../services/entity-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const ID = '22222222-2222-2222-2222-222222222222';
const ATTRIBUTE = "EntityDefinitions(LogicalName='contoso_type')/Attributes(LogicalName='contoso_halflife')";

const integer = (over: Record<string, unknown> = {}) => ({
  '@odata.context': 'https://org.example.crm.dynamics.com/api/data/v9.2/$metadata#…/$entity',
  '@odata.type': '#Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
  MetadataId: ID,
  LogicalName: 'contoso_halflife',
  AttributeType: 'Integer',
  Format: 'None',
  MinValue: 0,
  MaxValue: 36500,
  RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
  DisplayName: { LocalizedLabels: [{ Label: 'Half-life (Days)', LanguageCode: 1033 }] },
  ...over,
});

function service(calls: RecordedCall[], attribute: unknown) {
  return new EntityService(fakeClient([[ATTRIBUTE, attribute]], calls));
}

describe('EntityService.updateAttribute', () => {
  it('puts the whole definition back with the new required level and minimum, keeping labels, in the solution', async () => {
    const calls: RecordedCall[] = [];

    const result = await service(calls, integer()).updateAttribute('contoso_type', 'contoso_halflife',
      { requiredLevel: 'ApplicationRequired', minValue: 1 }, 'ContosoCore');

    expect(result).toMatchObject({
      attributeType: 'Integer', changed: true,
      before: { requiredLevel: 'None', minValue: 0, maxValue: 36500 },
      after: { requiredLevel: 'ApplicationRequired', minValue: 1, maxValue: 36500 },
    });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.endpoint).toBe(`api/data/v9.2/EntityDefinitions(LogicalName='contoso_type')/Attributes(${ID})`);
    expect(put?.headers).toEqual({ 'MSCRM.MergeLabels': 'true', 'MSCRM.SolutionUniqueName': 'ContosoCore' });
    expect(put?.data).toMatchObject({
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      LogicalName: 'contoso_halflife',
      MinValue: 1,
      MaxValue: 36500,
      Format: 'None',
      RequiredLevel: { Value: 'ApplicationRequired', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
      DisplayName: { LocalizedLabels: [{ Label: 'Half-life (Days)', LanguageCode: 1033 }] },
    });
    expect(put?.data).not.toHaveProperty(['@odata.context']);
  });

  it('changes a decimal minimum to a fraction and leaves the required level alone', async () => {
    const calls: RecordedCall[] = [];
    const decimal = integer({ '@odata.type': '#Microsoft.Dynamics.CRM.DecimalAttributeMetadata', AttributeType: 'Decimal', MinValue: -100000, MaxValue: 100000, Precision: 2 });

    await service(calls, decimal).updateAttribute('contoso_type', 'contoso_halflife', { minValue: 0.01 });

    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.data).toMatchObject({ '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', MinValue: 0.01, MaxValue: 100000, Precision: 2, RequiredLevel: { Value: 'None' } });
    expect(put?.headers).toEqual({ 'MSCRM.MergeLabels': 'true' });
  });

  it('writes nothing when the attribute is already as asked', async () => {
    const calls: RecordedCall[] = [];

    const result = await service(calls, integer({ MinValue: 1 })).updateAttribute('contoso_type', 'contoso_halflife', { minValue: 1, requiredLevel: 'None' });

    expect(result.changed).toBe(false);
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });

  it('refuses a minimum on an attribute that has none', async () => {
    const text = integer({ '@odata.type': '#Microsoft.Dynamics.CRM.StringAttributeMetadata', AttributeType: 'String', MinValue: undefined, MaxValue: undefined, MaxLength: 100 });

    await expect(service([], text).updateAttribute('contoso_type', 'contoso_halflife', { minValue: 1 }))
      .rejects.toThrow(/String: only Integer, Decimal, Double and Money attributes have a minimum and a maximum/);
  });

  it('refuses a minimum above the maximum, counting the one already stored', async () => {
    await expect(service([], integer()).updateAttribute('contoso_type', 'contoso_halflife', { minValue: 40000 }))
      .rejects.toThrow('The minimum (40000) is above the maximum (36500).');
  });

  it('refuses SystemRequired, an unknown level and a required level that cannot be changed', async () => {
    await expect(service([], integer()).updateAttribute('contoso_type', 'contoso_halflife', { requiredLevel: 'SystemRequired' }))
      .rejects.toThrow(/must be one of None, Recommended, ApplicationRequired/);
    await expect(service([], integer({ RequiredLevel: { Value: 'None', CanBeChanged: false } }))
      .updateAttribute('contoso_type', 'contoso_halflife', { requiredLevel: 'ApplicationRequired' }))
      .rejects.toThrow(/cannot be changed/);
  });

  it('sets the description in the organization\'s base language, keeping the other languages and the display name', async () => {
    const calls: RecordedCall[] = [];
    const labelled = integer({
      Description: {
        LocalizedLabels: [
          { Label: 'Old tooltip', LanguageCode: 1033, IsManaged: false, MetadataId: 'l1' },
          { Label: 'Stara podpowiedź', LanguageCode: 1045, IsManaged: false, MetadataId: 'l2' },
        ],
        UserLocalizedLabel: { Label: 'Old tooltip', LanguageCode: 1033, IsManaged: false, MetadataId: 'l1' },
      },
    });
    const client = fakeClient([[ATTRIBUTE, labelled], ['organizations?', { value: [{ languagecode: 1033 }] }]], calls);

    const result = await new EntityService(client).updateAttribute('contoso_type', 'contoso_halflife', { description: 'New tooltip' });

    expect(result).toMatchObject({ changed: true, languageCode: 1033, before: { description: 'Old tooltip' }, after: { description: 'New tooltip' } });
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.headers).toEqual({ 'MSCRM.MergeLabels': 'true' });
    expect(put?.data).toMatchObject({
      Description: {
        LocalizedLabels: [
          { Label: 'New tooltip', LanguageCode: 1033, MetadataId: 'l1' },
          { Label: 'Stara podpowiedź', LanguageCode: 1045, MetadataId: 'l2' },
        ],
        UserLocalizedLabel: { Label: 'New tooltip', LanguageCode: 1033 },
      },
      DisplayName: { LocalizedLabels: [{ Label: 'Half-life (Days)', LanguageCode: 1033 }] },
      MinValue: 0,
      RequiredLevel: { Value: 'None' },
    });
  });

  it('adds a display name in a language the attribute has no label in, without asking for the base language', async () => {
    const calls: RecordedCall[] = [];

    const result = await service(calls, integer()).updateAttribute('contoso_type', 'contoso_halflife', { displayName: 'Okres półtrwania', languageCode: 1045 });

    expect(calls.some((c) => c.endpoint.includes('organizations'))).toBe(false);
    expect(result).toMatchObject({ before: { displayName: undefined }, after: { displayName: 'Okres półtrwania' } });
    expect(calls.find((c) => c.method === 'PUT')?.data).toMatchObject({
      DisplayName: {
        LocalizedLabels: [{ Label: 'Half-life (Days)', LanguageCode: 1033 }, { Label: 'Okres półtrwania', LanguageCode: 1045 }],
        UserLocalizedLabel: null,
      },
    });
  });

  it('writes nothing when the label is already as asked', async () => {
    const calls: RecordedCall[] = [];

    const result = await service(calls, integer()).updateAttribute('contoso_type', 'contoso_halflife', { displayName: 'Half-life (Days)', languageCode: 1033 });

    expect(result.changed).toBe(false);
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });

  it('refuses an empty label and a language code that is not an LCID', async () => {
    await expect(service([], integer()).updateAttribute('contoso_type', 'contoso_halflife', { description: ' ' }))
      .rejects.toThrow('The description is empty.');
    await expect(service([], integer()).updateAttribute('contoso_type', 'contoso_halflife', { displayName: 'X', languageCode: 0 }))
      .rejects.toThrow(/must be a language's LCID/);
  });

  it('refuses a call that changes nothing, before reading anything', async () => {
    const calls: RecordedCall[] = [];
    await expect(service(calls, integer()).updateAttribute('contoso_type', 'contoso_halflife', {})).rejects.toThrow(/Nothing to change/);
    expect(calls).toHaveLength(0);
  });
});
