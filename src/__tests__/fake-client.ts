import type { PowerPlatformClient } from '../powerplatform-client.js';

export type Answer = unknown | ((endpoint: string, headers?: Record<string, string>) => unknown);

export interface RecordedCall {
  endpoint: string;
  headers?: Record<string, string>;
}

/**
 * A `PowerPlatformClient` stand-in for unit tests: `get` answers with the first route whose
 * needle the endpoint contains, and every call is recorded. Routes are tried in order, so
 * put the more specific needle first.
 */
export function fakeClient(
  routes: [string, Answer][],
  calls: RecordedCall[] = [],
  organizationUrl = 'https://org.example.crm.dynamics.com',
): PowerPlatformClient {
  return {
    organizationUrl,
    get: async (endpoint: string, headers?: Record<string, string>) => {
      calls.push({ endpoint, headers });
      const hit = routes.find(([needle]) => endpoint.includes(needle));
      if (!hit) throw new Error(`unexpected request: ${endpoint}`);
      const answer = hit[1];
      return typeof answer === 'function' ? (answer as (e: string, h?: Record<string, string>) => unknown)(endpoint, headers) : answer;
    },
  } as unknown as PowerPlatformClient;
}
