import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import type { EnvironmentRegistry } from '../environment-config.js';
import { CustomApiService } from '../services/customapi-service.js';
import { PluginService } from '../services/plugin-service.js';
import { registerCustomApiTools } from '../tools/customapi-tools.js';
import { registerPluginTools } from '../tools/plugin-tools.js';
import { fakeClient } from './fake-client.js';

/** A real MCP client and server over an in-memory transport, so output schemas are enforced. */
async function connect(register: (server: McpServer, registry: EnvironmentRegistry) => void, registry: unknown) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, registry as EnvironmentRegistry);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('list tools pass truncation through their output schema', () => {
  it('get-custom-apis: fields in structuredContent and a warning before the data', async () => {
    const dataverse = fakeClient([['customapis', { value: [{ uniquename: 'a' }, { uniquename: 'b' }, { uniquename: 'c' }], '@odata.count': 7 }]]);
    const client = await connect(registerCustomApiTools, { getContext: () => ({ getCustomApiService: () => new CustomApiService(dataverse) }) });

    const result = await client.callTool({ name: 'get-custom-apis', arguments: { maxRecords: 2 } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ hasMore: true, requestedMax: 2, totalMatching: 7 });
    const content = result.content as { text: string }[];
    expect(content[0].text).toBe('Warning: stopped at maxRecords=2 of 7 matching; more rows exist. Raise maxRecords or narrow the filter to see the rest.');
  });

  it('get-plugin-assemblies: a complete list has no warning', async () => {
    const dataverse = fakeClient([['pluginassemblies', { value: [{ pluginassemblyid: 'a', name: 'A', ishidden: { Value: false } }], '@odata.count': 1 }]]);
    const client = await connect(registerPluginTools, { getContext: () => ({ getPluginService: () => new PluginService(dataverse) }) });

    const result = await client.callTool({ name: 'get-plugin-assemblies', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ totalCount: 1, hasMore: false, requestedMax: 100, totalMatching: 1 });
    expect((result.content as { text: string }[])[0].text).toMatch(/^Found 1 plugin assemblies/);
  });
});
