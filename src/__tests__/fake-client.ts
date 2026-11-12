import type { PowerPlatformClient } from '../powerplatform-client.js';
import { fetchAllPages, type FetchAllOptions } from '../odata.js';

export type Answer = unknown | ((endpoint: string, headers?: Record<string, string>) => unknown);

export interface RecordedCall {
  endpoint: string;
  headers?: Record<string, string>;
  /** Set for writes (POST, PATCH, PUT, DELETE); a GET leaves it undefined. */
  method?: string;
  data?: unknown;
}

/**
 * A `PowerPlatformClient` stand-in for unit tests: `get` answers with the first route whose
 * needle the endpoint contains, writes succeed, and every call is recorded. Routes are tried in order, so
 * put the more specific needle first.
 */
export function fakeClient(
  routes: [string, Answer][],
  calls: RecordedCall[] = [],
  organizationUrl = 'https://org.example.crm.dynamics.com',
): PowerPlatformClient {
  const client = {
    organizationUrl,
    get: async (endpoint: string, headers?: Record<string, string>) => {
      calls.push({ endpoint, headers });
      const hit = routes.find(([needle]) => endpoint.includes(needle));
      if (!hit) throw new Error(`unexpected request: ${endpoint}`);
      const answer = hit[1];
      return typeof answer === 'function' ? (answer as (e: string, h?: Record<string, string>) => unknown)(endpoint, headers) : answer;
    },
    // Writes are recorded and succeed with no body.
    post: async (endpoint: string, data?: unknown, headers?: Record<string, string>) => { calls.push({ method: 'POST', endpoint, data, headers }); },
    patch: async (endpoint: string, data?: unknown, headers?: Record<string, string>) => { calls.push({ method: 'PATCH', endpoint, data, headers }); },
    put: async (endpoint: string, data?: unknown, headers?: Record<string, string>) => { calls.push({ method: 'PUT', endpoint, data, headers }); },
    delete: async (endpoint: string, headers?: Record<string, string>) => { calls.push({ method: 'DELETE', endpoint, headers }); },
    // The real client's paging, over the fake `get`.
    getAll: (endpoint: string, options?: FetchAllOptions) => fetchAllPages(client, endpoint, options),
  };
  return client as unknown as PowerPlatformClient;
}
