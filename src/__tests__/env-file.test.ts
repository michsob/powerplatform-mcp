import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from '../env-file.js';

describe('loadEnvFile', () => {
  let dir: string;
  let cwd: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-file-'));
    cwd = process.cwd();
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads .env from the current directory, and the shell wins over the file', () => {
    writeFileSync(join(dir, '.env'), 'POWERPLATFORM_ENVIRONMENTS=DEV\nPOWERPLATFORM_DEV_URL=https://file.crm.dynamics.com\n');
    process.chdir(dir);
    const env: NodeJS.ProcessEnv = { POWERPLATFORM_DEV_URL: 'https://shell.crm.dynamics.com' };

    loadEnvFile(env);

    expect(env.POWERPLATFORM_ENVIRONMENTS).toBe('DEV');
    expect(env.POWERPLATFORM_DEV_URL).toBe('https://shell.crm.dynamics.com');
  });

  it('loads the file DOTENV_CONFIG_PATH names instead', () => {
    const file = join(dir, 'client.env');
    writeFileSync(file, 'POWERPLATFORM_ENVIRONMENTS=UAT\n');
    writeFileSync(join(dir, '.env'), 'POWERPLATFORM_ENVIRONMENTS=DEV\n');
    process.chdir(dir);
    const env: NodeJS.ProcessEnv = { DOTENV_CONFIG_PATH: file };

    loadEnvFile(env);

    expect(env.POWERPLATFORM_ENVIRONMENTS).toBe('UAT');
  });

  it('leaves the environment as it is when there is no .env, and says nothing', () => {
    process.chdir(dir);
    const env: NodeJS.ProcessEnv = { POWERPLATFORM_ENVIRONMENTS: 'PROD' };
    const logged: unknown[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => { logged.push(args); };
    try {
      loadEnvFile(env);
    } finally {
      console.log = log;
    }

    expect(env).toEqual({ POWERPLATFORM_ENVIRONMENTS: 'PROD' });
    expect(logged).toEqual([]);
  });
});
