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
  console.log(`\nFull data: ${filePath}`);
}
