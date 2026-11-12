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
  /** Extra headers for every page. A `Prefer` here is combined with the page size. */
  headers?: Record<string, string>;
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
  const rows: T[] = [];
  const iterator = pages<T>(client, endpoint, options);
  for await (const page of iterator) {
    rows.push(...page.rows);
    if (rows.length >= maxRecords) {
      return { value: rows.slice(0, maxRecords), truncated: rows.length > maxRecords || page.more };
    }
  }
  return { value: rows, truncated: false };
}

/**
 * The pages of a collection one at a time, following `@odata.nextLink`; `more` says whether
 * another page follows. For a caller that filters rows as they come and stops once it has
 * enough. The endpoint must not set `$top`.
 */
export async function* pages<T>(
  client: PagingClient,
  endpoint: string,
  options: Pick<FetchAllOptions, 'pageSize' | 'headers'> = {},
): AsyncGenerator<{ rows: T[]; more: boolean }> {
  const prefer = [options.headers?.Prefer, options.pageSize ? `odata.maxpagesize=${options.pageSize}` : undefined]
    .filter(Boolean).join(',');
  const headers = options.headers || prefer ? { ...options.headers, ...(prefer ? { Prefer: prefer } : {}) } : undefined;
  let next: string | undefined = endpoint;
  while (next) {
    const page: { value?: T[]; '@odata.nextLink'?: string } = await client.get(next, headers);
    const link = page['@odata.nextLink'];
    next = link ? relativeEndpoint(link, client.organizationUrl) : undefined;
    yield { rows: page.value ?? [], more: next !== undefined };
  }
}

/** A nextLink (absolute) as an endpoint relative to the organization URL, which `get` expects. */
function relativeEndpoint(link: string, organizationUrl: string): string {
  const prefix = `${organizationUrl.replace(/\/+$/, '')}/`;
  if (link.startsWith(prefix)) return link.slice(prefix.length);
  const url = new URL(link);
  return `${url.pathname}${url.search}`.replace(/^\/+/, '');
}

/**
 * What a capped list says about its cap, so no caller mistakes the first N rows for the whole
 * set. Every list that stops at a `maxRecords` carries these fields.
 * (A type alias, not an interface, so a result that spreads it stays valid MCP `structuredContent`.)
 */
export type Truncation = {
  /** True when more rows match than were returned. */
  hasMore: boolean;
  /** The cap that was applied. */
  requestedMax: number;
  /** How many rows match in all, when Dataverse counted them (it stops counting at 5,000). */
  totalMatching?: number;
};

/** Dataverse runs `$top` as FetchXML `top`, which refuses anything above 5,000. */
export const MAX_TOP = 5000;

/** `endpoint` with more query options appended. */
export function withQuery(endpoint: string, query: string): string {
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`;
}

/** A row cap from a caller (a CLI flag or a tool argument): a positive integer, or an error. */
export function positiveCap(value: number, name = 'maxRecords'): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer (got ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * Trim a response fetched with `$top` one above `maxRecords` (and optionally `$count=true`) to
 * `maxRecords`, and say whether rows were cut.
 */
export function capRows<T>(response: { value?: T[]; [key: string]: unknown }, maxRecords: number): Truncation & { rows: T[] } {
  const value = response.value ?? [];
  // `$count` stops at 5,000: past that it is a floor, not a total, so it is not reported.
  const count = response['@odata.count'];
  const countIsFloor = typeof count === 'number'
    && (count >= MAX_TOP || response['@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded'] === true);
  const totalMatching = typeof count === 'number' && !countIsFloor ? count : undefined;
  const hasMore = value.length > maxRecords || (totalMatching !== undefined && totalMatching > maxRecords);
  return {
    rows: value.length > maxRecords ? value.slice(0, maxRecords) : value,
    hasMore,
    requestedMax: maxRecords,
    ...(totalMatching !== undefined ? { totalMatching } : {}),
  };
}

/** The client calls `fetchCapped` needs, so tests can pass a fake. */
export interface CappedClient extends PagingClient {
  getAll<T>(endpoint: string, options?: FetchAllOptions): Promise<{ value: T[]; truncated: boolean }>;
}

export interface FetchCappedOptions {
  /** Extra headers, e.g. a `Prefer` for formatted values. */
  headers?: Record<string, string>;
  /** Ask Dataverse for the number of matching rows (`$count=true`). Default true; turn it off
   * for a table that may not support it (an arbitrary table, an elastic table). */
  count?: boolean;
}

/**
 * At most `maxRecords` rows of `endpoint`, and whether more exist.
 *
 * The endpoint must not set `$top`. Below 5,000 this is one request with `$top` one above the
 * cap, so a further row shows that the list was cut (and `$count`, when on, gives the total).
 * From 5,000 up `$top` cannot be used (Dataverse refuses more, and a full 5,000 would look
 * complete), so the rows are paged with `@odata.nextLink` instead, up to one above the cap.
 */
export async function fetchCapped<T>(
  client: CappedClient,
  endpoint: string,
  maxRecords: number,
  options: FetchCappedOptions = {},
): Promise<Truncation & { rows: T[] }> {
  const cap = positiveCap(maxRecords);
  if (cap < MAX_TOP) {
    const query = `${options.count === false ? '' : '$count=true&'}$top=${cap + 1}`;
    const response = await client.get<{ value?: T[]; [key: string]: unknown }>(withQuery(endpoint, query), options.headers);
    return capRows(response, cap);
  }
  const { value, truncated } = await client.getAll<T>(endpoint, { maxRecords: cap + 1, headers: options.headers });
  const hasMore = value.length > cap || truncated;
  return { rows: hasMore ? value.slice(0, cap) : value, hasMore, requestedMax: cap };
}
