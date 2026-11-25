import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node';

/**
 * Where interactive sign-ins are kept: `POWERPLATFORM_TOKEN_CACHE_DIR`, or `~/.powerplatform-mcp/token-cache`.
 * Outside the working directory on purpose: the CLI writes its output to `./.pp-cache`, which may sit in a
 * repository, and a refresh token must never be committed.
 */
export function tokenCacheDir(): string {
  return process.env.POWERPLATFORM_TOKEN_CACHE_DIR?.trim() || join(homedir(), '.powerplatform-mcp', 'token-cache');
}

/**
 * One cache file per tenant and client id, so one sign-in serves every environment of that tenant (a refresh
 * token is good for any Dataverse organization there). Accounts in the file are told apart by user name.
 */
export function tokenCachePath(tenantId: string, clientId: string): string {
  const safe = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '_');
  return join(tokenCacheDir(), `${safe(tenantId)}_${safe(clientId)}.json`);
}

/**
 * MSAL's cache, persisted to `path`: read before every token request, written (owner-only, 0600, through a
 * temporary file and a rename) only when it changed. An unreadable file counts as empty, so a damaged cache
 * means signing in again rather than a command that cannot run.
 */
export function fileTokenCache(path: string): ICachePlugin {
  return {
    async beforeCacheAccess(context: TokenCacheContext): Promise<void> {
      let text: string;
      try {
        text = await readFile(path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      try {
        context.tokenCache.deserialize(text);
      } catch {
        console.error(`The token cache ${path} could not be read; sign in again.`);
      }
    },

    async afterCacheAccess(context: TokenCacheContext): Promise<void> {
      if (!context.cacheHasChanged) return;
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      try {
        await writeFile(temporary, context.tokenCache.serialize(), { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, path);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
  };
}
