import { spawnSync } from 'node:child_process';

/**
 * 1Password secret references in the environment: a variable whose value is `op://vault/item/field`
 * gets the secret in its place, read with the 1Password CLI (`op`), so a `.env` can hold references
 * instead of secrets. `OP_ACCOUNT` picks the account when more than one is signed in; `op` reads it
 * itself.
 */

/** How one `op` run ended. */
export interface OpResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export type OpRunner = (args: string[], env: NodeJS.ProcessEnv) => OpResult;

export interface OpResolution {
  /** Variables that now hold their secret. */
  resolved: string[];
  /** Variables whose reference still holds `.env.example` template text, like `op://<vault>/item/field`. */
  placeholders: string[];
  /** Variables that still hold their reference, with why. */
  failed: { name: string; message: string }[];
}

const REFERENCE = /^op:\/\//;
const PLACEHOLDER = /[<>]/;
/** Long enough to approve a 1Password prompt. */
const OP_TIMEOUT_MS = 120_000;

/**
 * `op` itself. Its stdin is never the process's own: the MCP server's stdin carries the protocol,
 * and `op` must not read from it. Sign in through the 1Password app integration, or with
 * `eval $(op signin)`, beforehand.
 */
export const runOpCli: OpRunner = (args, env) => {
  const result = spawnSync('op', args, {
    env,
    encoding: 'utf8',
    timeout: OP_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error as NodeJS.ErrnoException | undefined,
  };
};

/** The child `op run` starts: it prints the variables it was given, resolved, as JSON. */
const PRINT_RESOLVED =
  'const n=JSON.parse(process.env.__PP_OP_NAMES);' +
  'process.stdout.write(JSON.stringify(Object.fromEntries(n.map((k)=>[k,process.env[k]]))))';

function opMessage(result: OpResult): string {
  if (result.error?.code === 'ENOENT') return '1Password CLI (op) is not installed, or not on PATH';
  if (result.error?.code === 'ETIMEDOUT' || (result.status === null && result.error)) {
    return `op did not answer within ${OP_TIMEOUT_MS / 1000} s (a 1Password prompt left open?)`;
  }
  // `[ERROR] 2026/11/25 09:00:00 "X" isn't a vault in this account.` -> the message.
  const text = result.stderr.trim().replace(/^\[ERROR\]\s+\S+\s+\S+\s+/gm, '');
  return text || `op exited with status ${result.status}`;
}

/** Whether a failure is about this reference (its vault, item or field), not about op as a whole. */
function isAbout(reference: string, message: string): boolean {
  const parts = reference.replace(REFERENCE, '').split(/[/?]/).filter((p) => p.length > 1);
  const lower = message.toLowerCase();
  return parts.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Replace every `op://` reference in `env` with its secret. Never throws: what cannot be resolved
 * keeps its reference and is listed in `failed`, so `--help` works on a machine without `op`.
 *
 * One `op run` resolves them all, so 1Password asks once. When it fails, `op read` tries them one by
 * one, for a message per reference, and stops at a failure that is not about the reference it read
 * (not signed in, a prompt dismissed): every further read would fail the same way, and could prompt
 * again.
 */
export function resolveOpReferences(env: NodeJS.ProcessEnv = process.env, run: OpRunner = runOpCli): OpResolution {
  const names = Object.keys(env).filter((name) => REFERENCE.test(env[name] ?? ''));
  const placeholders = names.filter((name) => PLACEHOLDER.test(env[name] as string));
  const pending = names.filter((name) => !placeholders.includes(name));
  const resolution: OpResolution = { resolved: [], placeholders, failed: [] };
  if (pending.length === 0) return resolution;

  // `op run` resolves every reference in its environment and fails on any it cannot, so a
  // placeholder never reaches it.
  const runEnv: NodeJS.ProcessEnv = { ...env, __PP_OP_NAMES: JSON.stringify(pending) };
  for (const name of placeholders) delete runEnv[name];
  const all = run(['run', '--no-masking', '--', process.execPath, '-e', PRINT_RESOLVED], runEnv);
  // No op, or a prompt nobody answered: reading them one by one would only fail again, or wait again.
  if (all.error) {
    const message = opMessage(all);
    resolution.failed = pending.map((name) => ({ name, message }));
    return resolution;
  }
  let values: Record<string, unknown> = {};
  if (all.status === 0 && !all.error) {
    try {
      values = JSON.parse(all.stdout) as Record<string, unknown>;
    } catch {
      values = {};
    }
  }
  for (const name of pending) {
    const value = values[name];
    if (typeof value === 'string' && !REFERENCE.test(value)) {
      env[name] = value;
      resolution.resolved.push(name);
    }
  }

  const left = pending.filter((name) => !resolution.resolved.includes(name));
  for (let i = 0; i < left.length; i++) {
    const name = left[i];
    const reference = env[name] as string;
    const one = run(['read', '--no-newline', reference], env);
    if (one.status === 0 && !one.error) {
      env[name] = one.stdout;
      resolution.resolved.push(name);
      continue;
    }
    const message = opMessage(one);
    if (!isAbout(reference, message)) {
      resolution.failed.push(...left.slice(i).map((rest) => ({ name: rest, message })));
      break;
    }
    resolution.failed.push({ name, message });
  }
  return resolution;
}

/** What could not be resolved, for stderr; nothing when everything was. Names only, never a value. */
export function opResolutionReport(resolution: OpResolution): string[] {
  const lines: string[] = [];
  if (resolution.placeholders.length > 0) {
    const shown = resolution.placeholders.slice(0, 5).join(', ');
    const more = resolution.placeholders.length > 5 ? ` +${resolution.placeholders.length - 5} more` : '';
    lines.push(`Note: ${resolution.placeholders.length} 1Password reference(s) still contain <placeholders> and were skipped: ${shown}${more}`);
  }
  if (resolution.failed.length > 0) {
    lines.push(`Warning: ${resolution.failed.length} 1Password reference(s) could not be resolved; these variables still hold op:// references:`);
    const byMessage = new Map<string, string[]>();
    for (const { name, message } of resolution.failed) byMessage.set(message, [...(byMessage.get(message) ?? []), name]);
    for (const [message, failedNames] of byMessage) lines.push(`  ${failedNames.join(', ')}: ${message.split('\n').join('\n    ')}`);
  }
  return lines;
}
