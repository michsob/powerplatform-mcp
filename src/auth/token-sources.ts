import {
  ConfidentialClientApplication,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from '@azure/msal-node';
import { AuthenticationError } from './errors.js';
import { openBrowser } from './open-browser.js';
import { fileTokenCache, tokenCachePath } from './token-cache.js';

/**
 * Microsoft's public client for Dataverse, the one the Dataverse SDK samples, the Plugin Registration Tool and
 * XrmToolBox sign in with. It is consented in every tenant, so signing in as yourself needs no app registration.
 * Overridden per environment with `POWERPLATFORM_<NAME>_CLIENT_ID`.
 */
export const DEFAULT_INTERACTIVE_CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';

/** How long the browser sign-in may take before the command gives up. */
export const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

/** Gets an access token for one scope (`<resource>/.default`). */
export interface TokenSource {
  acquire(scope: string): Promise<AuthenticationResult | null>;
}

/** The app signs in as itself, with its client secret (client credentials). */
export class ClientSecretTokenSource implements TokenSource {
  private readonly app: ConfidentialClientApplication;

  constructor(tenantId: string, clientId: string, clientSecret: string) {
    this.app = new ConfidentialClientApplication({
      auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` },
    });
  }

  acquire(scope: string): Promise<AuthenticationResult | null> {
    return this.app.acquireTokenByClientCredential({ scopes: [scope] });
  }
}

export interface InteractiveSignInOptions {
  /** The environment's name, for messages (`--env` value). */
  environmentName: string;
  tenantId: string;
  clientId: string;
  /** The account to sign in with: the browser's login hint, and which cached account to use. */
  email?: string;
  /** Whether a token request may open the browser (the CLI) or must use the cache only (the MCP server). */
  allowInteractive: boolean;
  /** Overrides the cache file (tests). */
  tokenCachePath?: string;
  /** Overrides {@link SIGN_IN_TIMEOUT_MS} (tests). */
  signInTimeoutMs?: number;
  /** Overrides how the browser is opened (tests). */
  openBrowser?: (url: string) => Promise<void>;
}

/** MSAL's errors that a sign-in in the browser resolves: no token for the account, or one Entra no longer accepts. */
const INTERACTION_CODES = new Set([
  'interaction_required', 'consent_required', 'login_required', 'invalid_grant',
  'no_tokens_found', 'refresh_token_expired', 'bad_token', 'native_account_unavailable',
]);

function needsInteraction(error: unknown): boolean {
  if (error instanceof InteractionRequiredAuthError) return true;
  const code = (error as { errorCode?: unknown } | null)?.errorCode;
  return typeof code === 'string' && INTERACTION_CODES.has(code);
}

function sameUser(account: AccountInfo, email: string): boolean {
  return account.username.trim().toLowerCase() === email.trim().toLowerCase();
}

const page = (text: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>PowerPlatform CLI</title></head>` +
  `<body style="font-family:sans-serif;margin:3em"><p>${text}</p></body></html>`;

/**
 * A person signs in as themselves in the browser (authorization code with PKCE, MSAL's loopback redirect), and
 * the sign-in is cached on disk ({@link fileTokenCache}). Later requests renew the token silently from the cache;
 * only the CLI may open the browser again when the cache cannot.
 */
export class InteractiveTokenSource implements TokenSource {
  private readonly app: PublicClientApplication;
  readonly cachePath: string;

  constructor(private readonly options: InteractiveSignInOptions) {
    this.cachePath = options.tokenCachePath ?? tokenCachePath(options.tenantId, options.clientId);
    this.app = new PublicClientApplication({
      auth: { clientId: options.clientId, authority: `https://login.microsoftonline.com/${options.tenantId}` },
      cache: { cachePlugin: fileTokenCache(this.cachePath) },
    });
  }

  async acquire(scope: string): Promise<AuthenticationResult | null> {
    const account = await this.cachedAccount();
    if (account) {
      try {
        return await this.app.acquireTokenSilent({ account, scopes: [scope] });
      } catch (error) {
        if (!needsInteraction(error)) throw error;
      }
    }
    if (!this.options.allowInteractive) throw this.notSignedIn();
    return this.signIn(scope);
  }

  /** Sign in in the browser now, whatever the cache holds (CLI `login`: first sign-in, or another account). */
  async signIn(scope: string): Promise<AuthenticationResult> {
    const { environmentName, email } = this.options;
    const open = this.options.openBrowser ?? openBrowser;
    const timeoutMs = this.options.signInTimeoutMs ?? SIGN_IN_TIMEOUT_MS;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AuthenticationError(
        `Sign-in to "${environmentName}" did not finish within ${Math.round(timeoutMs / 1000)}s`, 'timeout')), timeoutMs);
    });

    try {
      return await Promise.race([
        this.app.acquireTokenInteractive({
          scopes: [scope],
          ...(email ? { loginHint: email } : { prompt: 'select_account' }),
          openBrowser: async (url: string) => {
            console.error(`Sign in to "${environmentName}" in your browser${email ? ` as ${email}` : ''}.`);
            console.error(`If no browser opens, go to:\n${url}`);
            await open(url);
          },
          successTemplate: page('Signed in. You can close this window and go back to the terminal.'),
          errorTemplate: page('Sign-in failed. Close this window; the terminal says why.'),
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Forget the environment's account (or, with no email configured, every account in its cache file). */
  async signOut(): Promise<string[]> {
    const cache = this.app.getTokenCache();
    const { email } = this.options;
    const accounts = (await cache.getAllAccounts()).filter((account) => !email || sameUser(account, email));
    for (const account of accounts) await cache.removeAccount(account);
    return accounts.map((account) => account.username);
  }

  /** The cached account this environment uses: the configured email's, or the only one. */
  private async cachedAccount(): Promise<AccountInfo | null> {
    const accounts = await this.app.getTokenCache().getAllAccounts();
    const { email, environmentName, tenantId } = this.options;
    if (email) return accounts.find((account) => sameUser(account, email)) ?? null;
    if (accounts.length <= 1) return accounts[0] ?? null;
    throw new AuthenticationError(
      `Several accounts are signed in for tenant ${tenantId} (${accounts.map((a) => a.username).join(', ')}): ` +
      `set POWERPLATFORM_${environmentName}_EMAIL to the one "${environmentName}" uses.`, 'multiple_accounts');
  }

  private notSignedIn(): AuthenticationError {
    const { environmentName, email } = this.options;
    return new AuthenticationError(
      `Not signed in to "${environmentName}"${email ? ` as ${email}` : ''}: run \`powerplatform-cli login --env ${environmentName}\` ` +
      `once; the CLI and the MCP server then use the cached sign-in.`, 'interaction_required');
  }
}
