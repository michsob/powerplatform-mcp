import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { opResolutionReport, resolveOpReferences, runOpCli, type OpResult, type OpRunner } from '../op-secrets.js';

const ok = (stdout: string): OpResult => ({ status: 0, stdout, stderr: '' });
const fail = (stderr: string): OpResult => ({ status: 1, stdout: '', stderr });

/** A fake `op`: `run` answers with `values` (or `runFails`), `read` with `secrets` or the error `reads` gives. */
function fakeOp(options: {
  values?: Record<string, string>;
  runFails?: string;
  secrets?: Record<string, string>;
  readFails?: (reference: string) => string;
  error?: NodeJS.ErrnoException;
}) {
  const calls: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const run: OpRunner = (args, env) => {
    calls.push({ args, env });
    if (options.error) return { status: null, stdout: '', stderr: '', error: options.error };
    if (args[0] === 'run') return options.runFails ? fail(options.runFails) : ok(JSON.stringify(options.values ?? {}));
    const reference = args[2];
    const secret = options.secrets?.[reference];
    return secret !== undefined ? ok(secret) : fail(options.readFails?.(reference) ?? 'unknown');
  };
  return { run, calls };
}

describe('resolveOpReferences', () => {
  it('does not run op when nothing is a reference', () => {
    const op = fakeOp({});
    const env: NodeJS.ProcessEnv = { POWERPLATFORM_DEV_CLIENT_SECRET: 'plain' };
    expect(resolveOpReferences(env, op.run)).toEqual({ resolved: [], placeholders: [], failed: [] });
    expect(op.calls).toHaveLength(0);
  });

  it('resolves every reference with one op run', () => {
    const op = fakeOp({ values: { A_SECRET: 'one', B_SECRET: 'two\nlines "quoted"' } });
    const env: NodeJS.ProcessEnv = { A_SECRET: 'op://Vault/A/credential', B_SECRET: 'op://Vault/B/credential', PLAIN: 'x' };

    const result = resolveOpReferences(env, op.run);

    expect(result.resolved).toEqual(['A_SECRET', 'B_SECRET']);
    expect(env).toMatchObject({ A_SECRET: 'one', B_SECRET: 'two\nlines "quoted"', PLAIN: 'x' });
    expect(op.calls).toHaveLength(1);
    expect(op.calls[0].args.slice(0, 3)).toEqual(['run', '--no-masking', '--']);
    expect(JSON.parse(op.calls[0].env.__PP_OP_NAMES as string)).toEqual(['A_SECRET', 'B_SECRET']);
  });

  it('skips a reference that still holds template text, and keeps it away from op run', () => {
    const op = fakeOp({ values: { A_SECRET: 'one' } });
    const env: NodeJS.ProcessEnv = { A_SECRET: 'op://Vault/A/credential', B_SECRET: 'op://<vaultname>/B/credential' };

    const result = resolveOpReferences(env, op.run);

    expect(result).toEqual({ resolved: ['A_SECRET'], placeholders: ['B_SECRET'], failed: [] });
    expect(env.B_SECRET).toBe('op://<vaultname>/B/credential');
    expect(op.calls[0].env).not.toHaveProperty('B_SECRET');
  });

  it('reads them one by one when op run fails on a bad reference, for a message each', () => {
    const op = fakeOp({
      runFails: '[ERROR] 2026/11/25 09:00:00 "CQI" isn\'t a vault in this account.',
      secrets: { 'op://Vault/A/credential': 'one', 'op://Vault/C/credential': 'three' },
      readFails: () => '[ERROR] 2026/11/25 09:00:01 "CQI" isn\'t a vault in this account. Specify the vault with its ID or name.',
    });
    const env: NodeJS.ProcessEnv = { A: 'op://Vault/A/credential', B: 'op://CQI/B/credential', C: 'op://Vault/C/credential' };

    const result = resolveOpReferences(env, op.run);

    expect(result.resolved).toEqual(['A', 'C']);
    expect(result.failed).toEqual([{ name: 'B', message: '"CQI" isn\'t a vault in this account. Specify the vault with its ID or name.' }]);
    expect(env).toMatchObject({ A: 'one', B: 'op://CQI/B/credential', C: 'three' });
  });

  it('stops reading at a failure that is not about the reference, so 1Password is not asked again for each', () => {
    const op = fakeOp({ runFails: 'authorization prompt dismissed', readFails: () => '[ERROR] 2026/11/25 09:00:01 authorization prompt dismissed, please try again' });
    const env: NodeJS.ProcessEnv = { A: 'op://Vault/A/credential', B: 'op://Vault/B/credential', C: 'op://Vault/C/credential' };

    const result = resolveOpReferences(env, op.run);

    expect(op.calls.map((c) => c.args[0])).toEqual(['run', 'read']);
    expect(result.failed.map((f) => f.name)).toEqual(['A', 'B', 'C']);
    expect(result.failed[2].message).toBe('authorization prompt dismissed, please try again');
  });

  it('runs op once and leaves the references when op is not installed', () => {
    const error = Object.assign(new Error('spawn op ENOENT'), { code: 'ENOENT' });
    const op = fakeOp({ error });
    const env: NodeJS.ProcessEnv = { A: 'op://Vault/A/credential', B: 'op://Vault/B/credential' };

    const result = resolveOpReferences(env, op.run);

    expect(op.calls).toHaveLength(1);
    expect(result.failed).toEqual([
      { name: 'A', message: '1Password CLI (op) is not installed, or not on PATH' },
      { name: 'B', message: '1Password CLI (op) is not installed, or not on PATH' },
    ]);
    expect(env.A).toBe('op://Vault/A/credential');
  });

  it('gives up after one wait when nobody answers the 1Password prompt', () => {
    const error = Object.assign(new Error('spawnSync op ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const op = fakeOp({ error });
    const result = resolveOpReferences({ A: 'op://Vault/A/credential' }, op.run);
    expect(op.calls).toHaveLength(1);
    expect(result.failed[0].message).toMatch(/did not answer within 120 s/);
  });
});

describe('opResolutionReport', () => {
  it('says nothing when every reference resolved', () => {
    expect(opResolutionReport({ resolved: ['A'], placeholders: [], failed: [] })).toEqual([]);
  });

  it('names the variables, groups them by message, and never shows a value', () => {
    const lines = opResolutionReport({
      resolved: [],
      placeholders: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
      failed: [{ name: 'A', message: 'not signed in' }, { name: 'B', message: 'not signed in' }, { name: 'C', message: '"CQI" isn\'t a vault' }],
    });
    expect(lines).toEqual([
      'Note: 7 1Password reference(s) still contain <placeholders> and were skipped: P1, P2, P3, P4, P5 +2 more',
      'Warning: 3 1Password reference(s) could not be resolved; these variables still hold op:// references:',
      '  A, B: not signed in',
      '  C: "CQI" isn\'t a vault',
    ]);
  });
});

describe('runOpCli', () => {
  let dir: string | undefined;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('resolves through a real op run, and the values come back intact', () => {
    // A stand-in `op` on PATH: `run` swaps each op:// value for a secret and runs the command, like op does.
    dir = mkdtempSync(join(tmpdir(), 'fake-op-'));
    const fake = join(dir, 'op');
    writeFileSync(fake, `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] !== 'run') process.exit(2);
const env = { ...process.env };
for (const [k, v] of Object.entries(env)) if (v.startsWith('op://')) env[k] = 'secret: ' + v.slice(5) + ' "&\\n';
const cmd = args.slice(args.indexOf('--') + 1);
process.exit(spawnSync(cmd[0], cmd.slice(1), { env, stdio: 'inherit' }).status ?? 1);
`);
    chmodSync(fake, 0o755);
    const env: NodeJS.ProcessEnv = { PATH: `${dir}:${process.env.PATH}`, A: 'op://Vault/A/credential', PLAIN: 'x' };

    const result = resolveOpReferences(env, runOpCli);

    expect(result).toEqual({ resolved: ['A'], placeholders: [], failed: [] });
    expect(env.A).toBe('secret: Vault/A/credential "&\n');
  });
});
