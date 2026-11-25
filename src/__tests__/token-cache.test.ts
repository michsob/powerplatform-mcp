import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TokenCacheContext } from '@azure/msal-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileTokenCache, tokenCacheDir, tokenCachePath } from '../auth/token-cache.js';

let dir: string;
const saved = process.env.POWERPLATFORM_TOKEN_CACHE_DIR;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pp-token-cache-'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  if (saved === undefined) delete process.env.POWERPLATFORM_TOKEN_CACHE_DIR;
  else process.env.POWERPLATFORM_TOKEN_CACHE_DIR = saved;
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

function context(hasChanged: boolean, serialized = '{"Account":{}}') {
  const deserialize = vi.fn();
  return {
    deserialize,
    context: { cacheHasChanged: hasChanged, tokenCache: { serialize: () => serialized, deserialize } } as unknown as TokenCacheContext,
  };
}

describe('tokenCachePath', () => {
  it('keeps the sign-ins in the home directory, not in the working directory', () => {
    delete process.env.POWERPLATFORM_TOKEN_CACHE_DIR;
    expect(tokenCacheDir()).toBe(join(homedir(), '.powerplatform-mcp', 'token-cache'));
  });

  it('has one file per tenant and client id, in the configured folder', () => {
    process.env.POWERPLATFORM_TOKEN_CACHE_DIR = dir;
    expect(tokenCachePath('DD469A72-36ef', ' 51f81489-12ee ')).toBe(join(dir, 'dd469a72-36ef_51f81489-12ee.json'));
    expect(tokenCachePath('contoso.onmicrosoft.com', 'a/b')).toBe(join(dir, 'contoso.onmicrosoft.com_a_b.json'));
  });
});

describe('fileTokenCache', () => {
  it('writes the cache owner-only, creating the folder, and reads it back', async () => {
    const path = join(dir, 'nested', 'cache.json');
    const plugin = fileTokenCache(path);
    await plugin.afterCacheAccess(context(true, '{"saved":true}').context);

    expect(await readFile(path, 'utf8')).toBe('{"saved":true}');
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readdir(join(dir, 'nested'))).toEqual(['cache.json']);

    const read = context(false);
    await plugin.beforeCacheAccess(read.context);
    expect(read.deserialize).toHaveBeenCalledWith('{"saved":true}');
  });

  it('writes nothing when the cache did not change', async () => {
    const path = join(dir, 'cache.json');
    await fileTokenCache(path).afterCacheAccess(context(false).context);
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('starts empty when there is no file yet', async () => {
    const read = context(false);
    await fileTokenCache(join(dir, 'missing.json')).beforeCacheAccess(read.context);
    expect(read.deserialize).not.toHaveBeenCalled();
  });

  it('treats a damaged file as empty, so signing in again fixes it', async () => {
    const path = join(dir, 'cache.json');
    await writeFile(path, 'not json');
    const read = context(false);
    read.deserialize.mockImplementation(() => { throw new SyntaxError('Unexpected token'); });

    await expect(fileTokenCache(path).beforeCacheAccess(read.context)).resolves.toBeUndefined();
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('could not be read; sign in again');
  });
});
