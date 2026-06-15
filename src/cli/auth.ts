import { spawn } from 'node:child_process'
import { loadConfig } from '../config.js'
import {
    pollForToken,
    requestDeviceCode,
    type OAuthClientConfig,
} from '../auth/oauth.js'
import { createFileTokenStore, defaultTokenPath } from '../auth/tokenStore.js'

/** Best-effort: open the verification URL in the user's browser. */
function tryOpenBrowser(url: string): void {
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

/**
 * Interactive sign-in via the Yandex device authorization grant. Prints a code
 * and URL, waits for the user to confirm, then caches the tokens (mode 0600).
 */
export async function runAuth(
    env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
    const config = loadConfig(env)
    if (!config.oauthClientId || !config.oauthClientSecret) {
        throw new Error(
            'Set YANDEX_OAUTH_CLIENT_ID and YANDEX_OAUTH_CLIENT_SECRET (from your app ' +
                'at https://oauth.yandex.com, scope metrika:read) before running `auth`.',
        )
    }

    const oauth: OAuthClientConfig = {
        clientId: config.oauthClientId,
        clientSecret: config.oauthClientSecret,
        baseUrl: config.oauthBaseUrl,
    }

    const device = await requestDeviceCode(oauth, { scope: 'metrika:read' })

    console.log('\nTo authorize this server with Yandex Metrica:')
    console.log(`  1. Open: ${device.verificationUrl}`)
    console.log(`  2. Enter the code: ${device.userCode}\n`)
    tryOpenBrowser(device.verificationUrl)
    console.log('Waiting for you to confirm in the browser…')

    const tokens = await pollForToken(oauth, device)

    const store = createFileTokenStore(defaultTokenPath(env))
    store.write(tokens)

    console.log(`\n✓ Signed in. Tokens saved to ${store.path} (mode 0600).`)
    console.log('You can now start the server with `yandex-metrica-mcp`.')
}
