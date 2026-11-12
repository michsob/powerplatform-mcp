import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CACHE_DIR = '.pp-cache';

export interface CommandResult {
  /** File name (without extension) for cache, e.g. 'account-attributes' */
  fileName: string;
  /** Full data to save to file */
  data: unknown;
  /** Concise summary lines for stdout */
  summary: string;
}

/**
 * Save full data to .pp-cache/{environmentName}/ and print concise summary to stdout.
 */
export function outputResult(result: CommandResult, environmentName: string): void {
  const cacheDir = resolve(process.cwd(), CACHE_DIR, environmentName);
  mkdirSync(cacheDir, { recursive: true });

  const filePath = join(cacheDir, `${result.fileName}.json`);
  writeFileSync(filePath, JSON.stringify(result.data, null, 2), 'utf-8');

  console.log(result.summary);
  const warning = truncationWarning(result.data);
  if (warning) console.log(warning);
  console.log(`\nFull data: ${filePath}`);
}

/**
 * The warning for a list that stopped at its cap (`hasMore`), so a partial list is never read
 * as the whole set. Empty for anything else.
 */
export function truncationWarning(data: unknown): string {
  const t = data as { hasMore?: unknown; requestedMax?: unknown; totalMatching?: unknown } | null;
  if (!t || typeof t !== 'object' || t.hasMore !== true) return '';
  const cap = typeof t.requestedMax === 'number' ? ` at ${t.requestedMax}` : '';
  const of = typeof t.totalMatching === 'number' ? ` of ${t.totalMatching} matching` : '';
  return `  ⚠ Stopped${cap}${of}; more exist. Raise --max (or narrow the filter) to see the rest.`;
}
