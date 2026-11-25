/**
 * Imported first by the CLI and the MCP server, for its side effect: `.env` is in the environment,
 * with its 1Password `op://` references resolved, before any module reads it.
 */
import { loadEnvFile } from './env-file.js';
import { opResolutionReport, resolveOpReferences } from './op-secrets.js';

loadEnvFile();
// stderr: the MCP server's stdout carries the protocol.
for (const line of opResolutionReport(resolveOpReferences())) process.stderr.write(`${line}\n`);
