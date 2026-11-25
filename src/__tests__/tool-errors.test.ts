import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import type { EnvironmentRegistry } from '../environment-config.js';
import { SolutionService } from '../services/solution-service.js';
import { registerAllTools } from '../tools/index.js';
import { fakeClient } from './fake-client.js';

/** A real MCP client and server over an in-memory transport, so output schemas are enforced. */
async function connect(registry: unknown) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerAllTools(server, registry as EnvironmentRegistry);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minItems?: number;
  minimum?: number;
  exclusiveMinimum?: number;
};

/** A value the schema accepts, so the call gets past input validation into the tool. */
function sample(schema: JsonSchema): unknown {
  if (schema.enum) return schema.enum[0];
  const alternative = schema.anyOf?.[0] ?? schema.oneOf?.[0];
  if (alternative) return sample(alternative);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case 'string': return '00000000-0000-0000-0000-000000000001';
    case 'number':
    case 'integer': return schema.minimum ?? (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : 1);
    case 'boolean': return false;
    case 'array': return Array.from({ length: schema.minItems ?? 0 }, () => sample(schema.items ?? {}));
    // `confirm: true` gets a destructive tool past its guard, whose refusal is a result by design.
    case 'object': return Object.fromEntries((schema.required ?? []).map((k) => [k, k === 'confirm' ? true : sample(schema.properties?.[k] ?? {})]));
    default: return 'x';
  }
}

describe('a tool that fails says why', () => {
  it('every tool returns its error as an error result, with the message, not an output-schema failure', async () => {
    const client = await connect({ getContext: () => { throw new Error('environment unavailable'); } });
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(60);

    const failures: string[] = [];
    for (const tool of tools) {
      const result = await client.callTool({ name: tool.name, arguments: sample(tool.inputSchema as JsonSchema) as Record<string, unknown> });
      const text = (result.content as { text?: string }[]).map((c) => c.text ?? '').join('\n');
      if (result.isError !== true || !text.includes('environment unavailable')) {
        failures.push(`${tool.name}: isError=${result.isError} ${text.slice(0, 120)}`);
      }
    }
    expect(failures.join('\n')).toBe('');
  });

  it('a lookup that finds nothing is an error result too', async () => {
    const dataverse = fakeClient([['solutions', { value: [] }]]);
    const client = await connect({ getContext: () => ({ getSolutionService: () => new SolutionService(dataverse) }) });

    const result = await client.callTool({ name: 'get-solution', arguments: { uniqueName: 'Nope' } });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toBe("Solution 'Nope' not found");
  });
});
