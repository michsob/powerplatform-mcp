import { describe, expect, it } from 'vitest';
import { ConfigurationService } from '../services/configuration-service.js';
import {
  environmentVariableMaskReason,
  holdsPlaintextCredential,
  looksLikeKeyVaultReference,
  maskEnvironmentVariables,
} from '../services/environment-variable-masking.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const def = (over: Record<string, unknown>) => ({
  environmentvariabledefinitionid: 'd', schemaname: 'contoso_Url', displayname: 'Url', type: 100000000,
  defaultvalue: null, effectiveValue: null, currentValues: [], ...over,
});

describe('environment variable masking', () => {
  it('masks Secret-type variables, credential names and credential values', () => {
    expect(environmentVariableMaskReason(def({ type: 100000005 }))).toBe('Secret type');
    for (const name of ['contoso_ClientSecret', 'contoso_ServiceApiKey', 'contoso_lms_ws_token', 'contoso_AdminPassword', 'contoso_SqlConnectionString', 'contoso-sas-url']) {
      expect(environmentVariableMaskReason(def({ schemaname: name })), name).toBe('credential-like name');
    }
    expect(environmentVariableMaskReason(def({ displayname: 'Auth0 Client Secret' }))).toBe('credential-like name');
    expect(environmentVariableMaskReason(def({ effectiveValue: 'DefaultEndpointsProtocol=https;AccountName=a;AccountKey=abc==' })))
      .toBe('credential-like value');
    expect(environmentVariableMaskReason(def({ defaultvalue: 'https://f.azurewebsites.net/api/x?code=abc' }))).toBe('credential-like value');
  });

  it('leaves coordinates in clear: URLs, ids, a Key Vault URL', () => {
    expect(environmentVariableMaskReason(def({ effectiveValue: 'https://contoso.sharepoint.com' }))).toBeNull();
    expect(environmentVariableMaskReason(def({ schemaname: 'contoso_KeyVaultUrl' }))).toBeNull();
    expect(environmentVariableMaskReason(def({ schemaname: 'contoso_Auth0ClientID', displayname: 'Auth0 Client ID' }))).toBeNull();
  });

  it('replaces every copy of the value with *** and its length, and flags a literal credential', () => {
    const masked = maskEnvironmentVariables({ value: [
      def({ schemaname: 'contoso_ApiKey', defaultvalue: 'default-key', effectiveValue: 'override-key-1',
        currentValues: [{ value: 'override-key-1', modifiedon: 'x' }] }),
      def({ schemaname: 'contoso_Vault', type: 100000005, effectiveValue: '/subscriptions/s/…/secrets/x' }),
      def({ schemaname: 'contoso_Url', effectiveValue: 'https://x' }),
    ] }).value;
    const text = JSON.stringify(masked);
    expect(text).not.toContain('override-key-1');
    expect(text).not.toContain('default-key');
    expect(masked[0]).toMatchObject({
      defaultvalue: '*** (11 chars)', effectiveValue: '*** (14 chars)', valueMasked: true,
      maskReason: 'credential-like name', plaintextCredential: true,
    });
    expect((masked[0].currentValues as Record<string, unknown>[])[0]).toMatchObject({ value: '*** (14 chars)', modifiedon: 'x' });
    expect(masked[1]).toMatchObject({ valueMasked: true, maskReason: 'Secret type', plaintextCredential: false });
    expect(masked[2]).toMatchObject({ effectiveValue: 'https://x', valueMasked: false });
  });

  it('settings about a credential are not credentials: lifetimes, expiries, minutes', () => {
    for (const name of ['contoso_TokenLifetimeMinutes', 'contoso_AccessTokenExpiry', 'contoso_ApiKeyRotationDays', 'contoso_SecretTimeout', 'contoso_TokenCacheMinutes']) {
      expect(environmentVariableMaskReason(def({ schemaname: name, effectiveValue: '60' })), name).toBeNull();
    }
    expect(environmentVariableMaskReason(def({ schemaname: 'contoso_AccessToken' }))).toBe('credential-like name');
  });

  it('masks a JSON value with a credential key at any depth, and an unparseable one naming one', () => {
    const json = (value: string) => def({ schemaname: 'contoso_PaymentConfig', type: 100000003, effectiveValue: value });
    expect(environmentVariableMaskReason(json('{"provider":"stripe","secretKey":"sk_live_abc"}'))).toBe('credential-like JSON key');
    expect(environmentVariableMaskReason(json('{"stripe":{"keys":[{"webhookSecret":"whsec_x"}]}}'))).toBe('credential-like JSON key');
    expect(environmentVariableMaskReason(json('{"provider":"stripe", "apiKey": "abc",'))).toBe('credential-like JSON key');
    expect(environmentVariableMaskReason(json('{"merchant":"x","value":"Bearer abc.def"}'))).toBe('credential-like value');
    expect(environmentVariableMaskReason(json('{"provider":"stripe","currency":"GBP"}'))).toBeNull();
  });

  it('masks credential values whatever the name: Stripe-style keys and Authorization headers', () => {
    for (const value of ['sk_live_51Habc', 'rk_test_abc', 'pk_live_abc', 'Basic dXNlcjpwYXNz', 'Bearer eyJabc']) {
      expect(environmentVariableMaskReason(def({ schemaname: 'contoso_PaymentSettings', effectiveValue: value })), value).toBe('credential-like value');
    }
    expect(environmentVariableMaskReason(def({ schemaname: 'contoso_AuthHeader', currentValues: [{ value: 'Basic dXNl' }] }))).toBe('credential-like value');
    expect(environmentVariableMaskReason(def({ effectiveValue: 'Basically fine' }))).toBeNull();
    // A publishable key is masked but is not a plain-text credential finding.
    const pk = maskEnvironmentVariables({ value: [
      def({ schemaname: 'contoso_PaymentSettings', effectiveValue: 'pk_live_abc' }),
      def({ schemaname: 'contoso_StripePublishableKey', effectiveValue: 'pk_test_abc' }),
      def({ schemaname: 'contoso_PaymentSettings', effectiveValue: 'sk_live_abc' }),
    ] }).value;
    expect(pk.map((m) => [m.valueMasked, m.plaintextCredential])).toEqual([[true, false], [true, false], [true, true]]);
  });

  it('a Key Vault reference is not a plain-text credential', () => {
    expect(looksLikeKeyVaultReference('https://kv-x.vault.azure.net/secrets/client-secret')).toBe(true);
    expect(looksLikeKeyVaultReference('@Microsoft.KeyVault(SecretUri=https://kv.vault.azure.net/secrets/x/)')).toBe(true);
    expect(looksLikeKeyVaultReference('/subscriptions/s/resourceGroups/r/providers/Microsoft.KeyVault/vaults/v/secrets/x')).toBe(true);
    expect(looksLikeKeyVaultReference('https://kv-x.vault.azure.net/')).toBe(false);

    const masked = maskEnvironmentVariables({ value: [
      def({ schemaname: 'contoso_ClientSecretRef', effectiveValue: 'https://kv.vault.azure.net/secrets/x' }),
      def({ schemaname: 'contoso_ApiKey', effectiveValue: '@Microsoft.KeyVault(VaultName=kv;SecretName=x)' }),
      def({ schemaname: 'contoso_ClientSecret', effectiveValue: 'literal-secret' }),
      def({ schemaname: 'contoso_TokenLifetimeMinutes', effectiveValue: '60' }),
      def({ schemaname: 'contoso_ApiKeyVersion', type: 100000001, effectiveValue: '3' }),
      def({ schemaname: 'contoso_UseClientSecret', type: 100000002, effectiveValue: 'true' }),
      def({ schemaname: 'contoso_Password', effectiveValue: '' }),
    ] }).value;
    expect(masked.map((m) => m.plaintextCredential)).toEqual([false, false, true, undefined, false, false, false]);
    expect(masked[3]).toMatchObject({ valueMasked: false, effectiveValue: '60' });
  });

  it('a JSON value is a plain-text credential only when a credential in it is a literal', () => {
    const flag = (value: string) => holdsPlaintextCredential(def({ schemaname: 'contoso_PaymentConfig', type: 100000003, effectiveValue: value }));
    expect(flag('{"secretKey":"sk_live_abc"}')).toBe(true);
    expect(flag('{"secretKey":"https://kv.vault.azure.net/secrets/stripe"}')).toBe(false);
    expect(flag('{"secretKey":""}')).toBe(false);
    expect(flag('{"auth":{"clientSecret":"x"},"name":"y"}')).toBe(true);
    expect(flag('{"apiKey": "abc",')).toBe(true);
    expect(flag('{"publishableKey":"pk_live_abc"}')).toBe(false);
    expect(flag('{"publishableKey":"pk_live_abc","secretKey":"sk_live_abc"}')).toBe(true);
  });
});

describe('ConfigurationService.getEnvironmentVariables', () => {
  it('fetches values for the returned definitions only, so an override is never cut off by a cap', async () => {
    const calls: RecordedCall[] = [];
    const defs = Array.from({ length: 25 }, (_, i) => ({
      environmentvariabledefinitionid: `d${i}`, schemaname: `contoso_Var${i}`, type: 100000000, defaultvalue: 'default',
    }));
    const service = new ConfigurationService(fakeClient([
      ['environmentvariabledefinitions', { value: defs }],
      ['environmentvariablevalues', (endpoint: string) => ({
        value: endpoint.includes('eq d24')
          ? [{ _environmentvariabledefinitionid_value: 'd24', value: 'override', modifiedon: '2026-01-01T00:00:00Z' }]
          : [],
      })],
    ], calls));

    const result = await service.getEnvironmentVariables();

    const valueCalls = calls.filter((c) => c.endpoint.includes('environmentvariablevalues'));
    expect(valueCalls).toHaveLength(2); // 25 definitions in chunks of 20
    expect(valueCalls.every((c) => !c.endpoint.includes('$top'))).toBe(true);
    expect(valueCalls[0].endpoint).toContain('_environmentvariabledefinitionid_value eq d0 or');

    expect(result.value[24]).toMatchObject({
      effectiveValue: 'override', valueSource: 'value', valueModifiedOn: '2026-01-01T00:00:00Z', typeName: 'String',
    });
    expect(result.value[0]).toMatchObject({ effectiveValue: 'default', valueSource: 'default', currentValues: [] });
  });

  it('returns values in clear — masking is for what is printed, cached or handed to an agent', async () => {
    const service = new ConfigurationService(fakeClient([
      ['environmentvariabledefinitions', { value: [{ environmentvariabledefinitionid: 'd1', schemaname: 'contoso_ApiKey', type: 100000000 }] }],
      ['environmentvariablevalues', { value: [{ _environmentvariabledefinitionid_value: 'd1', value: 'k' }] }],
    ]));
    expect((await service.getEnvironmentVariables()).value[0]).toMatchObject({ effectiveValue: 'k', valueSource: 'value' });
  });

  it('makes no value request when no definitions match', async () => {
    const calls: RecordedCall[] = [];
    const service = new ConfigurationService(fakeClient([['environmentvariabledefinitions', { value: [] }]], calls));
    expect((await service.getEnvironmentVariables()).value).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
