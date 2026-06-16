import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { loadConfig } from '../config.js'
import {
    buildAuthorizeUrl,
    exchangeCode,
    type OAuthClientConfig,
} from '../auth/oauth.js'
import { generatePkce } from '../auth/pkce.js'
import { createFileTokenStore, defaultTokenPath } from '../auth/tokenStore.js'

/** Best-effort: open the authorization URL in the user's browser. */
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

/** Prompt the user on stdin and resolve with the trimmed answer. */
function prompt(question: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close()
            resolve(answer.trim())
        })
    })
}

/**
 * Interactive sign-in via the authorization-code + PKCE flow (out-of-band).
 * Opens the consent page, the user copies the code shown by Yandex, and we
 * exchange it for a token — no client secret needed. The token is cached
 * (mode 0600) and is valid ~1 year.
 */
export async function runAuth(
    env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
    const config = loadConfig(env)
    const oauth: OAuthClientConfig = {
        clientId: config.oauthClientId,
        clientSecret: config.oauthClientSecret,
        baseUrl: config.oauthBaseUrl,
    }

    const pkce = generatePkce()
    const url = buildAuthorizeUrl(oauth, {
        codeChallenge: pkce.challenge,
        scope: 'metrika:read',
    })

    console.log('\nTo authorize this server with Yandex Metrica:')
    console.log(`  1. Open this URL and approve access:\n     ${url}`)
    console.log('  2. Copy the code Yandex shows you on the next page.\n')
    tryOpenBrowser(url)

    const code = await prompt('Paste the code here: ')
    if (!code) throw new Error('No code entered — aborting.')

    const tokens = await exchangeCode(oauth, {
        code,
        codeVerifier: pkce.verifier,
    })

    const store = createFileTokenStore(defaultTokenPath(env))
    store.write(tokens)

    console.log(`\n✓ Signed in. Token saved to ${store.path} (mode 0600).`)
    console.log('You can now start the server with `yandex-metrica-mcp`.')
}
