import { Command, CommanderError, type OutputConfiguration } from 'commander';
import type { EnvironmentRegistry } from '../environment-config.js';
import { registerAllCommands } from './commands/index.js';

/**
 * The CLI's commands. Commander does not exit itself: its help, version and usage errors come back to
 * {@link runProgram} as a `CommanderError`, so the exit waits for the output (see {@link exitAfterFlush}).
 * `output` replaces where Commander writes (tests).
 */
export function createProgram(registry: EnvironmentRegistry, version: string, output?: OutputConfiguration): Command {
  const program = new Command();
  // Before the commands are added: each copies these settings when it is made.
  program.exitOverride();
  if (output) program.configureOutput(output);

  program
    .name('powerplatform-cli')
    .description('PowerPlatform CLI — query Dataverse metadata with cached file output')
    .version(version)
    .option('--env <name>', 'Environment name (e.g. DEV, UAT). Defaults to first configured environment.');

  registerAllCommands(program, registry);
  return program;
}

/**
 * Exit with `code` once stdout and stderr have written everything queued. Writing to a pipe is
 * asynchronous, and `process.exit()` straight after a large write dropped the rest: `--help | less`
 * stopped at 16 KB. The exit still comes, so a handle left open (a sign-in's loopback server after a
 * timeout) cannot keep the CLI running.
 */
export function exitAfterFlush(code: number): void {
  process.exitCode = code;
  let pending = 2;
  const done = () => {
    if (--pending === 0) process.exit(code);
  };
  // A write's callback runs after the writes before it, and also when the stream has failed or closed.
  process.stdout.write('', done);
  process.stderr.write('', done);
}

/**
 * Run the CLI. A command that finishes lets the process end on its own; Commander's exits (help,
 * version, a usage error, already written) and a command that throws end in `exit`.
 */
export async function runProgram(
  program: Command,
  argv: string[],
  exit: (code: number) => void = exitAfterFlush,
): Promise<void> {
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      exit(error.exitCode);
      return;
    }
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }
}
