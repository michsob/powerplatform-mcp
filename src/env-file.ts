import { config } from 'dotenv';

/**
 * Load a `.env` file into the environment: `.env` in the current directory, or the file
 * `DOTENV_CONFIG_PATH` names. A missing file is not an error, so plain environment variables
 * keep working on their own.
 *
 * A variable that is already set wins over the file, so the shell, `docker run --env-file`
 * or an MCP client's `env` block can always override it.
 *
 * Quiet: dotenv 17 logs a line on every load, and the MCP server speaks JSON-RPC over stdout,
 * where that line would break the protocol.
 */
export function loadEnvFile(env: NodeJS.ProcessEnv = process.env): void {
  config({ path: env.DOTENV_CONFIG_PATH || undefined, processEnv: env as Record<string, string>, quiet: true });
}
