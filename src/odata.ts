/**
 * Helpers for building Dataverse Web API queries safely.
 *
 * Queries in this package are built as strings, so every value that comes from a caller goes
 * through one of these before it is put into a URL:
 * - `odataString` for a string literal in `$filter` or a key segment (`'O''Brien'`),
 * - `odataGuid` for an id in `$filter` or a key segment (`accounts(<guid>)`),
 * - `odataIdentifier` for a name that is part of the path or the query syntax itself
 *   (an entity set, a navigation property, a logical name).
 *
 * A value that is not escaped can change what the query means: a quote ends the literal, and
 * `&` or `#` ends the `$filter` parameter. Dataverse then answers a different question, and a
 * write that follows a lookup can update the wrong row.
 */

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A string literal for `$filter` or a key segment: single-quoted, with embedded quotes doubled
 * and everything that means something in a URL (`&`, `#`, `%`, `+`, spaces) percent-encoded.
 * Dataverse decodes the literal before it compares.
 */
export function odataString(value: string): string {
  return `'${encodeURIComponent(value.replace(/'/g, "''"))}'`;
}

export function isGuid(value: string): boolean {
  return GUID_PATTERN.test(value.trim().replace(/^\{|\}$/g, ''));
}

/**
 * A GUID for `$filter` or a key segment: braces and whitespace removed, lower-cased. Throws on
 * anything else, naming the parameter, so a bad id fails before any request is sent.
 */
export function odataGuid(value: string, name = 'id'): string {
  const trimmed = typeof value === 'string' ? value.trim().replace(/^\{|\}$/g, '') : '';
  if (!GUID_PATTERN.test(trimmed)) {
    throw new Error(`${name} must be a GUID (got ${JSON.stringify(value)})`);
  }
  return trimmed.toLowerCase();
}

/**
 * A name that becomes part of the URL's syntax rather than a value in it: an entity set name,
 * a navigation property, a logical or schema name. Throws unless it is a plain identifier.
 */
export function odataIdentifier(value: string, name = 'name'): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${name} must be a plain identifier (letters, digits, underscores; got ${JSON.stringify(value)})`);
  }
  return value;
}

/** An integer for `$filter` (an option set value, a type code). Throws on anything else, NaN included. */
export function odataInteger(value: number | string, name = 'value'): string {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    throw new Error(`${name} must be an integer (got ${JSON.stringify(value)})`);
  }
  return String(n);
}

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * A date or date-time for `$filter` (`2026-01-31` or `2026-01-31T09:00:00Z`), unquoted as
 * OData expects. Throws on anything else.
 */
export function odataDateTime(value: string, name = 'date'): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!DATE_TIME_PATTERN.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new Error(`${name} must be an ISO 8601 date or date-time, e.g. 2026-01-31 or 2026-01-31T09:00:00Z (got ${JSON.stringify(value)})`);
  }
  return trimmed;
}

/**
 * `(field eq a or field eq b …)` for already-formatted literals. Returns null for an empty
 * list, so a caller cannot send an empty filter by accident.
 */
export function odataAnyOf(field: string, literals: string[]): string | null {
  if (literals.length === 0) return null;
  return `(${literals.map((l) => `${field} eq ${l}`).join(' or ')})`;
}

/** Split a list into chunks, to keep `or` filters well inside the URL length limit. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Check that every row a lookup returned satisfies the lookup, before acting on it. Throws when
 * one does not: the filter did not apply as written, and the row must not be updated or deleted
 * in the belief that it was the one asked for.
 */
export function expectAll<T>(rows: T[], predicate: (row: T) => boolean, description: string): T[] {
  const bad = rows.filter((r) => !predicate(r));
  if (bad.length > 0) {
    throw new Error(
      `Dataverse returned ${bad.length} of ${rows.length} row(s) that do not match ${description}; ` +
        'the filter was not applied as written, so the result is not used.',
    );
  }
  return rows;
}

/** The two members of the client that `fetchAllPages` needs, so tests can pass a fake. */
export interface PagingClient {
  readonly organizationUrl: string;
  get<T>(endpoint: string, extraHeaders?: Record<string, string>): Promise<T>;
}

export interface FetchAllOptions {
  /** Stop once this many rows have been read. Default: no limit. */
  maxRecords?: number;
  /** Server page size (`Prefer: odata.maxpagesize`). Dataverse's own default is 5,000. */
  pageSize?: number;
}

/**
 * Every page of a collection, following `@odata.nextLink`, up to `maxRecords` rows.
 *
 * Do not put `$top` on the endpoint: Dataverse returns no nextLink when `$top` is set, so the
 * first page would look like the whole set. `truncated` is true when rows were left unread.
 */
export async function fetchAllPages<T>(
  client: PagingClient,
  endpoint: string,
  options: FetchAllOptions = {},
): Promise<{ value: T[]; truncated: boolean }> {
  const maxRecords = options.maxRecords ?? Number.POSITIVE_INFINITY;
  const headers = options.pageSize ? { Prefer: `odata.maxpagesize=${options.pageSize}` } : undefined;
  const rows: T[] = [];
  let next: string | undefined = endpoint;

  while (next) {
    const page: { value?: T[]; '@odata.nextLink'?: string } = await client.get(next, headers);
    rows.push(...(page.value ?? []));
    const link = page['@odata.nextLink'];
    next = link ? relativeEndpoint(link, client.organizationUrl) : undefined;
    if (rows.length >= maxRecords) {
      return { value: rows.slice(0, maxRecords), truncated: rows.length > maxRecords || next !== undefined };
    }
  }
  return { value: rows, truncated: false };
}

/** A nextLink (absolute) as an endpoint relative to the organization URL, which `get` expects. */
function relativeEndpoint(link: string, organizationUrl: string): string {
  const prefix = `${organizationUrl.replace(/\/+$/, '')}/`;
  if (link.startsWith(prefix)) return link.slice(prefix.length);
  const url = new URL(link);
  return `${url.pathname}${url.search}`.replace(/^\/+/, '');
}
