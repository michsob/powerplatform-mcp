import { describe, expect, it } from 'vitest';
import {
  chunk, expectAll, fetchAllPages, isGuid, odataAnyOf, odataDateTime, odataGuid, odataIdentifier, odataInteger, odataString,
} from '../odata.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const GUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('odataString', () => {
  it('doubles quotes and encodes what would end the parameter or the URL', () => {
    expect(odataString("O'Brien")).toBe("'O''Brien'");
    expect(odataString('a&b#c d+e%f')).toBe("'a%26b%23c%20d%2Be%25f'");
    // A value cannot close the literal and add a clause of its own.
    expect(odataString("x' or name ne '")).toBe("'x''%20or%20name%20ne%20'''");
  });

  it('leaves a plain name readable', () => {
    expect(odataString('contoso_project')).toBe("'contoso_project'");
  });
});

describe('odataGuid', () => {
  it('accepts braces, upper case and whitespace, and returns the bare lower-case form', () => {
    expect(odataGuid(` {${GUID.toUpperCase()}} `)).toBe(GUID);
    expect(isGuid(GUID)).toBe(true);
  });

  it('rejects anything else, naming the parameter', () => {
    expect(() => odataGuid('123', 'roleId')).toThrow('roleId must be a GUID (got "123")');
    expect(() => odataGuid(`${GUID})/Microsoft.Dynamics.CRM.Delete(`, 'recordId')).toThrow('recordId must be a GUID');
    expect(() => odataGuid(undefined as unknown as string)).toThrow('id must be a GUID');
    expect(isGuid('not-a-guid')).toBe(false);
  });
});

describe('odataIdentifier, odataInteger, odataDateTime', () => {
  it('accepts plain identifiers only', () => {
    expect(odataIdentifier('contoso_projects')).toBe('contoso_projects');
    expect(() => odataIdentifier('accounts(1)/x', 'entityNamePlural')).toThrow('entityNamePlural must be a plain identifier');
    expect(() => odataIdentifier('')).toThrow();
  });

  it('accepts integers only, from numbers or numeric strings', () => {
    expect(odataInteger(5)).toBe('5');
    expect(odataInteger('12', 'type')).toBe('12');
    expect(() => odataInteger(Number.NaN, 'type')).toThrow('type must be an integer');
    expect(() => odataInteger('1 or 1 eq 1', 'category')).toThrow('category must be an integer');
    expect(() => odataInteger(1.5)).toThrow();
  });

  it('accepts ISO dates and date-times only', () => {
    expect(odataDateTime('2026-01-31')).toBe('2026-01-31');
    expect(odataDateTime('2026-01-31T09:00:00Z')).toBe('2026-01-31T09:00:00Z');
    expect(odataDateTime('2026-01-31T09:00:00.123+01:00')).toBe('2026-01-31T09:00:00.123+01:00');
    expect(() => odataDateTime('yesterday', 'startedAfter')).toThrow('startedAfter must be an ISO 8601 date');
    expect(() => odataDateTime('2026-13-45')).toThrow();
  });
});

describe('odataAnyOf, chunk, expectAll', () => {
  it('builds an or-filter and refuses an empty one', () => {
    expect(odataAnyOf('roleid', ['a', 'b'])).toBe('(roleid eq a or roleid eq b)');
    expect(odataAnyOf('roleid', [])).toBeNull();
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('throws when a returned row does not satisfy the lookup', () => {
    expect(expectAll([{ n: 'a' }], (r) => r.n === 'a', "n eq 'a'")).toHaveLength(1);
    expect(() => expectAll([{ n: 'a' }, { n: 'b' }], (r) => r.n === 'a', "n eq 'a'"))
      .toThrow("Dataverse returned 1 of 2 row(s) that do not match n eq 'a'");
  });
});

describe('fetchAllPages', () => {
  const ORG = 'https://org.example.crm.dynamics.com';
  const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: from + i }));

  it('follows nextLink as an endpoint relative to the organization URL', async () => {
    const calls: RecordedCall[] = [];
    const client = fakeClient([
      ['skiptoken=2', { value: rows(4, 1) }],
      ['skiptoken=1', { value: rows(2, 2), '@odata.nextLink': `${ORG}/api/data/v9.2/accounts?$skiptoken=2` }],
      ['accounts', { value: rows(0, 2), '@odata.nextLink': `${ORG}/api/data/v9.2/accounts?$skiptoken=1` }],
    ], calls, ORG);

    const result = await fetchAllPages(client, 'api/data/v9.2/accounts?$select=name', { pageSize: 2 });
    expect(result).toEqual({ value: rows(0, 5), truncated: false });
    expect(calls.map((c) => c.endpoint)).toEqual([
      'api/data/v9.2/accounts?$select=name', 'api/data/v9.2/accounts?$skiptoken=1', 'api/data/v9.2/accounts?$skiptoken=2',
    ]);
    expect(calls.every((c) => c.headers?.Prefer === 'odata.maxpagesize=2')).toBe(true);
  });

  it('stops at maxRecords and says rows were left unread', async () => {
    const calls: RecordedCall[] = [];
    const client = fakeClient([
      ['accounts', { value: rows(0, 3), '@odata.nextLink': `${ORG}/api/data/v9.2/accounts?$skiptoken=1` }],
    ], calls, ORG);
    expect(await fetchAllPages(client, 'api/data/v9.2/accounts', { maxRecords: 3 })).toEqual({ value: rows(0, 3), truncated: true });
    expect(calls).toHaveLength(1);
  });

  it('a set that ends exactly at maxRecords is not truncated', async () => {
    const client = fakeClient([['accounts', { value: rows(0, 3) }]], [], ORG);
    expect(await fetchAllPages(client, 'api/data/v9.2/accounts', { maxRecords: 3 })).toEqual({ value: rows(0, 3), truncated: false });
  });
});
