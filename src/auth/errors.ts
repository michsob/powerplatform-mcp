/** Token acquisition failed. The message carries MSAL's error code and the AADSTS reason. */
export class AuthenticationError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/** MSAL's error as text: its code and the first line of its message (the AADSTS reason). */
export function authenticationError(what: string, error: unknown): AuthenticationError {
  if (error instanceof AuthenticationError) return error;
  const e = error as { errorCode?: unknown; errorMessage?: unknown; message?: unknown } | null;
  const code = typeof e?.errorCode === 'string' && e.errorCode ? e.errorCode : undefined;
  const text = typeof e?.errorMessage === 'string' && e.errorMessage ? e.errorMessage
    : typeof e?.message === 'string' ? e.message : String(error);
  const reason = text.split(/\r?\n/)[0].trim();
  return new AuthenticationError(`${what} failed${code ? ` (${code})` : ''}: ${reason}`, code);
}
