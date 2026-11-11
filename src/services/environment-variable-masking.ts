/**
 * Masking for environment variable values.
 *
 * An environment variable can hold a credential (an API key, a client secret, a connection
 * string) even when its type is plain String or JSON. Anything this package prints, caches
 * or hands to an agent goes through `maskEnvironmentVariables` first; the service itself
 * returns values in clear for library callers.
 */

export const ENVIRONMENT_VARIABLE_TYPES: Record<number, string> = {
  100000000: 'String',
  100000001: 'Number',
  100000002: 'Boolean',
  100000003: 'JSON',
  100000004: 'Data Source',
  100000005: 'Secret',
};

const ENV_TYPE_NUMBER = 100000001;
const ENV_TYPE_BOOLEAN = 100000002;
const ENV_TYPE_SECRET = 100000005;

/**
 * Names that mark a variable as a credential (secret, password, key, token, PAT, connection
 * string, credential, SAS), including the spellings schema names use (`ClientSecret`, `ApiKey`,
 * `ConnStr`). Matched against the schema name, the display name and the keys of a JSON value,
 * with `_`, `-` and spaces ignored.
 */
const CREDENTIAL_NAME = /secret|password|passwd|pwd|key|token|pat$|connectionstring|connstr|credential|sas|signature|apikey/i;

/**
 * Names that look like a credential but hold something else: a coordinate (a vault URL, a
 * key's id or name, a token endpoint) or a setting about the credential (a lifetime, an
 * expiry, a timeout, a count of minutes).
 */
const NOT_A_CREDENTIAL_NAME = new RegExp([
  'keyvault(url|uri|name)', 'keyid$', 'keyname$', 'tokenurl$', 'tokenendpoint$', 'monkey', 'keyword',
  '(token|key|secret|password|credential)(lifetime|expiry|expiration|expires|ttl|timeout|duration|validity|rotation)',
  '(minutes|mins|seconds|secs|hours|days|ttl|timeout|lifetime|expiry|expiration|duration|interval|enabled|count)$',
].join('|'), 'i');

/** A value that is itself a credential, whatever the variable is called. */
const CREDENTIAL_VALUE = new RegExp([
  '(AccountKey|SharedAccessKey|SharedAccessSignature|Password|Pwd|ClientSecret)=',
  '[?&](sig|code)=',
  '^eyJ[\\w-]+\\.[\\w-]+\\.',                // a JWT
  '^(sk|rk|pk)_(live|test)_\\w', '^whsec_\\w',  // Stripe-style API and webhook keys
  '^(Basic|Bearer)\\s+\\S',                    // an Authorization header value
].join('|'), 'i');

/**
 * A Key Vault reference rather than the secret itself: a secret URI, an app-setting style
 * `@Microsoft.KeyVault(...)` reference, or the resource id a Secret-type variable holds.
 */
export function looksLikeKeyVaultReference(value: string): boolean {
  return /^@Microsoft\.KeyVault\(|vault\.azure\.net\/secrets\/|\/providers\/Microsoft\.KeyVault\/vaults\/[^/]+\/secrets\//i
    .test(value.trim());
}

/** A Stripe-style publishable key: masked with the rest, but public by design, so never the finding. */
const PUBLISHABLE_KEY = /^pk_(live|test)_\w+$/i;

/** A value that is a credential in name or shape but not a secret one: a vault reference or a publishable key. */
const isNotASecret = (value: string) => looksLikeKeyVaultReference(value) || PUBLISHABLE_KEY.test(value.trim());

function isCredentialName(name: string): boolean {
  const n = name.replace(/[\s_-]/g, '');
  return CREDENTIAL_NAME.test(n) && !NOT_A_CREDENTIAL_NAME.test(n);
}

/** A JSON value parsed, or `undefined` when it is not JSON (or not an object or array). */
function parseJsonValue(value: string): unknown {
  const t = value.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

/** Every string leaf of a parsed JSON value, with the key it sits under (null in an array). */
function jsonLeaves(node: unknown, key: string | null = null, out: { key: string | null; value: string }[] = []) {
  if (typeof node === 'string') out.push({ key, value: node });
  else if (Array.isArray(node)) for (const item of node) jsonLeaves(item, key, out);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) jsonLeaves(v, k, out);
  }
  return out;
}

/** Every key of a parsed JSON value, at any depth. */
function jsonKeys(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const item of node) jsonKeys(item, out);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) { out.push(k); jsonKeys(v, out); }
  }
  return out;
}

/** The keys a JSON-looking string names, read with a regex when it does not parse. */
const quotedKeys = (value: string) => [...value.matchAll(/"([^"\\]{1,100})"\s*:/g)].map((m) => m[1]);

type JsonCredentialCheck = { credentialKey: boolean; credentialLeaf: boolean; literal: boolean };

/**
 * What a JSON value holds: a credential-named key (at any depth), a leaf that is itself a
 * credential, and whether any of those holds a literal rather than a Key Vault reference.
 * A value that does not parse but names a credential key counts as literal: it cannot be
 * shown not to be.
 */
function checkJsonValue(value: string): JsonCredentialCheck | null {
  const parsed = parseJsonValue(value);
  if (parsed === undefined) {
    const t = value.trim();
    if (!t.startsWith('{') && !t.startsWith('[')) return null;
    const credentialKey = quotedKeys(t).some(isCredentialName);
    return { credentialKey, credentialLeaf: false, literal: credentialKey };
  }
  const credentialKey = jsonKeys(parsed).some(isCredentialName);
  const leaves = jsonLeaves(parsed);
  const credentialLeaf = leaves.some((l) => CREDENTIAL_VALUE.test(l.value));
  const literal = leaves.some((l) => l.value.length > 0 && !isNotASecret(l.value)
    && ((l.key !== null && isCredentialName(l.key)) || CREDENTIAL_VALUE.test(l.value)));
  return { credentialKey, credentialLeaf, literal };
}

function definitionValues(def: Record<string, unknown>): string[] {
  return [def.defaultvalue, def.effectiveValue, ...((def.currentValues as Record<string, unknown>[] | undefined) ?? []).map((v) => v.value)]
    .filter((v): v is string => typeof v === 'string');
}

/** Why a variable's values are masked, or null when they print in clear. */
export function environmentVariableMaskReason(def: Record<string, unknown>): string | null {
  if (def.type === ENV_TYPE_SECRET) return 'Secret type';
  const names = [def.schemaname, def.displayname].filter((n): n is string => typeof n === 'string');
  if (names.some(isCredentialName)) return 'credential-like name';
  const values = definitionValues(def);
  if (values.some((v) => CREDENTIAL_VALUE.test(v.trim()))) return 'credential-like value';
  // A JSON value (the JSON type, or a string holding an object) is a credential when any key in
  // it is named like one, or any string in it is one.
  const json = values.map(checkJsonValue).filter((c): c is JsonCredentialCheck => c !== null);
  if (json.some((c) => c.credentialKey)) return 'credential-like JSON key';
  if (json.some((c) => c.credentialLeaf)) return 'credential-like value';
  return null;
}

/**
 * Whether a masked variable's effective value is a literal credential — a security finding.
 * False for a Secret-type variable, an empty value, a Number or Boolean (a credential-named
 * one holds a setting, not a secret), a Key Vault reference and a `pk_` publishable key; for a
 * JSON value with credential keys or credential-looking strings in it, true only when one of
 * those is a literal.
 */
export function holdsPlaintextCredential(def: Record<string, unknown>): boolean {
  if (def.type === ENV_TYPE_SECRET) return false;
  if (def.type === ENV_TYPE_NUMBER || def.type === ENV_TYPE_BOOLEAN) return false;
  const effective = def.effectiveValue;
  if (typeof effective !== 'string' || effective.trim().length === 0) return false;
  if (isNotASecret(effective)) return false;
  const json = checkJsonValue(effective);
  if (json && (json.credentialKey || json.credentialLeaf)) return json.literal;
  return true;
}

/** `***` plus the length, so a report can still say "set" or "empty" without the value. */
export function maskValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.length === 0 ? '' : `*** (${value.length} chars)`;
}

/**
 * Environment variables as a CLI or an agent may see them: the values of `Secret`-type
 * variables, of variables named like a credential, of JSON values with a credential-named key,
 * and of values that are themselves a credential are replaced by `*** (N chars)`. Each
 * definition says `valueMasked` and why (`maskReason`); `plaintextCredential` flags a masked
 * variable whose effective value is a literal credential rather than a Key Vault reference,
 * without printing it.
 */
export function maskEnvironmentVariables<T extends { value: Record<string, unknown>[] }>(result: T): T {
  return {
    ...result,
    value: result.value.map((def) => {
      const reason = environmentVariableMaskReason(def);
      if (!reason) return { ...def, valueMasked: false };
      return {
        ...def,
        defaultvalue: maskValue(def.defaultvalue),
        effectiveValue: maskValue(def.effectiveValue),
        currentValues: ((def.currentValues as Record<string, unknown>[] | undefined) ?? [])
          .map((v) => ({ ...v, value: maskValue(v.value) })),
        valueMasked: true,
        maskReason: reason,
        plaintextCredential: holdsPlaintextCredential(def),
      };
    }),
  };
}
