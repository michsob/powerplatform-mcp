import { describe, expect, it } from 'vitest';
import { EntityService } from '../services/entity-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

/** An organization whose base language is German, with no Polish installed. */
const german = (calls: RecordedCall[], answer: unknown = { value: [{ languagecode: 1031 }] }) =>
  new EntityService(fakeClient([['organizations?', answer]], calls));

const posted = (calls: RecordedCall[]) => calls.filter((c) => c.method === 'POST').map((c) => c.data as any);
const languages = (label: any) => label.LocalizedLabels.map((l: any) => l.LanguageCode);

describe('labels on created columns and tables', () => {
  it('are in the organization base language when no language is given', async () => {
    const calls: RecordedCall[] = [];
    await german(calls).createStringAttribute('contoso_settings', 'contoso_note', 'Note', 100, 'None', 'A note');

    const [body] = posted(calls);
    expect(languages(body.DisplayName)).toEqual([1031]);
    expect(languages(body.Description)).toEqual([1031]);
  });

  it('are in the language given, without asking for the base language', async () => {
    const calls: RecordedCall[] = [];
    await german(calls).createStringAttribute('contoso_settings', 'contoso_note', 'Note', 100, 'None', undefined, 1033);

    expect(languages(posted(calls)[0].DisplayName)).toEqual([1033]);
    expect(calls.some((c) => c.endpoint.includes('organizations'))).toBe(false);
  });

  it('use the base language in every create, asking for it once per service', async () => {
    const calls: RecordedCall[] = [];
    const service = german(calls);

    await service.createEntity('contoso_Invoice', 'Invoice', 'Invoices', 'contoso_Name', 'Name');
    await service.createBooleanAttribute('contoso_invoice', 'contoso_paid', 'Paid', 'Yes', 'No');
    await service.createLookupAttribute('contoso_invoice', 'account', 'contoso_account_invoice', 'contoso_AccountId', 'Account');
    await service.createAlternateKey('contoso_invoice', 'contoso_number_key', 'Number', ['contoso_number']);

    const [entity, boolean, lookup, key] = posted(calls);
    expect(languages(entity.DisplayName)).toEqual([1031]);
    expect(languages(entity.Attributes[0].DisplayName)).toEqual([1031]);
    expect(languages(boolean.OptionSet.TrueOption.Label)).toEqual([1031]);
    expect(JSON.stringify(lookup)).not.toMatch(/"LanguageCode":(?!1031)\d+/);
    expect(languages(key.DisplayName)).toEqual([1031]);
    expect(calls.filter((c) => c.endpoint.includes('organizations'))).toHaveLength(1);
  });

  it('asks again after a failed lookup instead of keeping the failure', async () => {
    const calls: RecordedCall[] = [];
    let attempts = 0;
    const service = german(calls, () => {
      if (++attempts === 1) throw new Error('throttled');
      return { value: [{ languagecode: 1031 }] };
    });

    await expect(service.createStringAttribute('contoso_settings', 'contoso_note', 'Note')).rejects.toThrow('throttled');
    await service.createStringAttribute('contoso_settings', 'contoso_note', 'Note');

    expect(languages(posted(calls)[0].DisplayName)).toEqual([1031]);
  });
});
