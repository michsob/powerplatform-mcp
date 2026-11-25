import { spawn } from 'node:child_process';

/**
 * Open `url` in the default browser, without waiting for it. A machine with no browser to open (a container,
 * SSH) is not an error: the caller prints the URL first, so it can be opened by hand.
 */
export async function openBrowser(url: string): Promise<void> {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    // rundll32 takes the URL as one argument; `cmd /c start` would split it at every '&'.
    : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* no browser: the printed URL remains */ });
    child.unref();
  } catch {
    // As above.
  }
}
