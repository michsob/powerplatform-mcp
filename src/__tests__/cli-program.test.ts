import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentRegistry } from '../environment-config.js';
import { createProgram, exitAfterFlush, runProgram } from '../cli/program.js';

const argv = (...args: string[]) => ['node', 'powerplatform-cli', ...args];

/** The CLI with its real commands, Commander's output captured, and `exit` recorded instead of made. */
function cli(registry: unknown = {}) {
  const output = { out: '', err: '' };
  const program = createProgram(registry as EnvironmentRegistry, '9.9.9', {
    writeOut: (text) => { output.out += text; },
    writeErr: (text) => { output.err += text; },
  });
  const exits: number[] = [];
  const run = (...args: string[]) => runProgram(program, argv(...args), (code) => { exits.push(code); });
  return { run, output, exits };
}

describe('the CLI exits only after its output is written', () => {
  let processExit: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    processExit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code}) called directly`);
    }) as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('--help writes the whole help, past 16 KB, then exits 0', async () => {
    const { run, output, exits } = cli();
    await run('--help');

    expect(output.out.length).toBeGreaterThan(16_384);
    expect(output.out).toMatch(/^Usage: powerplatform-cli/);
    expect(output.out).toContain('deploy-plugin');
    expect(output.out).toContain('check-solution-dependencies');
    expect(exits).toEqual([0]);
    expect(processExit).not.toHaveBeenCalled();
  });

  it('--version exits 0 after printing it', async () => {
    const { run, output, exits } = cli();
    await run('--version');
    expect(output.out).toBe('9.9.9\n');
    expect(exits).toEqual([0]);
  });

  it('a usage error exits 1, with Commander\'s message', async () => {
    const { run, output, exits } = cli();
    await run('no-such-command');
    expect(output.err).toContain("unknown command 'no-such-command'");
    expect(exits).toEqual([1]);

    const missing = cli();
    await missing.run('solution');
    expect(missing.output.err).toContain("missing required argument 'uniqueName'");
    expect(missing.exits).toEqual([1]);
  });

  it('a command that fails says why and exits 1', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((text: string) => { errors.push(text); });
    const { run, exits } = cli({ getContext: () => { throw new Error('environment unavailable'); } });

    await run('solutions');

    expect(errors).toEqual(['Error: environment unavailable']);
    expect(exits).toEqual([1]);
    expect(processExit).not.toHaveBeenCalled();
  });

  it('a command that succeeds does not exit: the process ends on its own once its output is out', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((text: string) => { lines.push(text); });
    const client = {
      organizationUrl: 'https://org.example.crm.dynamics.com',
      get: async (endpoint: string) => (endpoint.includes('WhoAmI') ? { UserId: 'u1' } : { fullname: 'App User' }),
    };
    const { run, exits } = cli({
      getEnvironment: () => ({ name: 'DEV', authMethod: 'client-secret', clientId: 'app' }),
      getClient: () => client,
    });

    await run('whoami');

    expect(lines[0]).toBe('DEV (https://org.example.crm.dynamics.com), signs in with client secret of app app.');
    expect(exits).toEqual([]);
    expect(processExit).not.toHaveBeenCalled();
  });
});

describe('exitAfterFlush', () => {
  const exitCode = process.exitCode;
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = exitCode;
  });

  it('exits once stdout and stderr have written what was queued before it', async () => {
    const order: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown, callback?: () => void) => {
      order.push(`stdout ${JSON.stringify(chunk)}`);
      setTimeout(() => callback?.(), 5);
      return true;
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown, callback?: () => void) => {
      order.push(`stderr ${JSON.stringify(chunk)}`);
      setTimeout(() => callback?.(), 1);
      return true;
    }) as never);
    const exited = new Promise<number>((resolve) => {
      vi.spyOn(process, 'exit').mockImplementation(((code: number) => { resolve(code); }) as never);
    });

    exitAfterFlush(3);

    expect(process.exitCode).toBe(3);
    expect(process.exit).not.toHaveBeenCalled();
    expect(await exited).toBe(3);
    expect(order).toEqual(['stdout ""', 'stderr ""']);
  });
});
