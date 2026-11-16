import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebResourceService, type WebResourceFile } from '../services/webresource-service.js';
import { webResourceFiles } from '../cli/commands/webresource-commands.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const b64 = (text: string) => Buffer.from(text).toString('base64');
const PAGE = 'aaaaaaaa-0000-0000-0000-000000000001';
const SCRIPT = 'aaaaaaaa-0000-0000-0000-000000000002';
const STYLE = 'aaaaaaaa-0000-0000-0000-000000000003';

const files: WebResourceFile[] = [
  { name: 'contoso_/app/page.html', displayName: 'page.html', webResourceType: 1, content: b64('<p>new</p>') },
  { name: 'contoso_/app/app.js', displayName: 'app.js', webResourceType: 3, content: b64('same()') },
  { name: 'contoso_/app/app.css', displayName: 'app.css', webResourceType: 2, content: b64('a{}') },
];

/** The latest web resources by name: the page changed, the script the same, the stylesheet new (created on POST). */
function service(calls: RecordedCall[], latest: Record<string, unknown> = {
  'contoso_/app/page.html': { webresourceid: PAGE, name: 'contoso_/app/page.html', webresourcetype: 1, content: b64('<p>old</p>') },
  'contoso_/app/app.js': { webresourceid: SCRIPT, name: 'contoso_/app/app.js', webresourcetype: 3, content: b64('same()') },
}) {
  let created = false;
  const client = fakeClient([
    ['RetrieveUnpublishedMultiple', (endpoint: string) => {
      const name = decodeURIComponent(/name eq '([^']+)'/.exec(endpoint)![1]);
      return { value: latest[name] ? [latest[name]] : [] };
    }],
    ['webresourceset?$filter=name eq', () => ({ value: created ? [{ webresourceid: STYLE, name: 'contoso_/app/app.css' }] : [] })],
  ], calls);
  const post = client.post.bind(client);
  (client as unknown as { post: typeof client.post }).post = (async (endpoint: string, data?: unknown, headers?: Record<string, string>) => {
    await post(endpoint, data, headers);
    if (endpoint === 'api/data/v9.2/webresourceset') created = true;
  }) as typeof client.post;
  return new WebResourceService(client);
}

describe('WebResourceService.pushWebResources', () => {
  it('writes the changed and the new, leaves the same, adds every one to the solution and publishes the written', async () => {
    const calls: RecordedCall[] = [];
    const result = await service(calls).pushWebResources(files, { solutionName: 'ContosoCore' });

    expect(result.results).toEqual([
      { name: 'contoso_/app/page.html', webResourceId: PAGE, status: 'updated' },
      { name: 'contoso_/app/app.js', webResourceId: SCRIPT, status: 'unchanged' },
      { name: 'contoso_/app/app.css', webResourceId: STYLE, status: 'created' },
    ]);
    const solution = { 'MSCRM.SolutionUniqueName': 'ContosoCore' };
    expect(calls.filter((c) => c.method)).toEqual([
      { method: 'PATCH', endpoint: `api/data/v9.2/webresourceset(${PAGE})`, data: { content: b64('<p>new</p>') }, headers: solution },
      { method: 'POST', endpoint: 'api/data/v9.2/AddSolutionComponent', headers: undefined,
        data: { ComponentId: SCRIPT, ComponentType: 61, SolutionUniqueName: 'ContosoCore', AddRequiredComponents: false } },
      { method: 'POST', endpoint: 'api/data/v9.2/webresourceset', headers: solution,
        data: { name: 'contoso_/app/app.css', displayname: 'app.css', webresourcetype: 2, content: b64('a{}') } },
      { method: 'POST', endpoint: 'api/data/v9.2/PublishXml', headers: undefined,
        data: { ParameterXml: `<importexportxml><webresources><webresource>${PAGE}</webresource><webresource>${STYLE}</webresource></webresources></importexportxml>` } },
    ]);
    expect(result.published).toBe(true);
  });

  it('publishes nothing when nothing changed', async () => {
    const calls: RecordedCall[] = [];
    const result = await service(calls).pushWebResources([files[1]]);

    expect(result).toEqual({ results: [{ name: 'contoso_/app/app.js', webResourceId: SCRIPT, status: 'unchanged' }], published: false });
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });

  it('refuses a file whose type differs from its web resource before any write', async () => {
    const calls: RecordedCall[] = [];
    await expect(service(calls).pushWebResources([{ ...files[0], webResourceType: 3 }])).rejects.toThrow(/is of type 1, not 3/);
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });
});

describe('webResourceFiles', () => {
  it('names each file by the prefix and its path, takes the type from the extension, skips the rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wr-'));
    mkdirSync(join(dir, 'icons'));
    writeFileSync(join(dir, 'page.html'), '<p>x</p>');
    writeFileSync(join(dir, 'icons', 'a.svg'), '<svg/>');
    writeFileSync(join(dir, 'notes.md'), '# x');
    writeFileSync(join(dir, '.hidden.js'), 'x');

    const { files: found, skipped } = webResourceFiles(dir, 'contoso_/app/');

    expect(found.map((f) => [f.name, f.webResourceType, f.displayName])).toEqual([
      ['contoso_/app/icons/a.svg', 11, 'a.svg'],
      ['contoso_/app/page.html', 1, 'page.html'],
    ]);
    expect(found[1].content).toBe(b64('<p>x</p>'));
    expect(skipped).toEqual(['notes.md']);
  });
});
