import { createInterface } from 'node:readline'
import { interactiveLogin } from '../auth/login.js'
import type { OAuthClientConfig } from '../auth/oauth.js'
import { createFileTokenStore, defaultTokenPath } from '../auth/tokenStore.js'
import { loadConfig } from '../config.js'

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

export interface AuthOptions {
    /** Force the copy-paste flow instead of the loopback redirect. */
    oob?: boolean
}

/**
 * Interactive sign-in (authorization-code + PKCE). Uses the loopback redirect so
 * the browser returns the code automatically; falls back to copy-paste when the
 * local port is unavailable or `--oob` is passed. The token is cached (mode
 * 0600) and is valid ~1 year.
 */
export async function runAuth(
    env: NodeJS.ProcessEnv = process.env,
    opts: AuthOptions = {},
): Promise<void> {
    const config = loadConfig(env)
    const oauth: OAuthClientConfig = {
        clientId: config.oauthClientId,
        clientSecret: config.oauthClientSecret,
        baseUrl: config.oauthBaseUrl,
    }

    const tokens = await interactiveLogin({
        oauth,
        loopbackPort: config.oauthLoopbackPort,
        forceOob: opts.oob,
        log: message => console.log(message),
        promptForCode: async url => {
            console.log('\nTo authorize this server with Yandex Metrica:')
            console.log(`  1. Open this URL and approve access:\n     ${url}`)
            console.log(
                '  2. Copy the code Yandex shows you on the next page.\n',
            )
            return prompt('Paste the code here: ')
        },
    })

    const store = createFileTokenStore(defaultTokenPath(env))
    store.write(tokens)

    console.log(`\n✓ Signed in. Token saved to ${store.path} (mode 0600).`)
    console.log('You can now start the server with `yandex-metrica-mcp`.')
}
