import { spawn } from 'node:child_process'

/** Best-effort: open a URL in the user's default browser. Never throws. */
export function openBrowser(url: string): void {
    const cmd =
        process.platform === 'darwin'
            ? 'open'
            : process.platform === 'win32'
              ? 'explorer'
              : 'xdg-open'
    try {
        spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref()
    } catch {
        // Opening a browser is a convenience; ignore failures.
    }
}
