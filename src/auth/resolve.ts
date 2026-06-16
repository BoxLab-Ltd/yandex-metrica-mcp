import type { Config } from '../config.js'
import type { OAuthClientConfig } from './oauth.js'
import {
    RefreshingTokenProvider,
    StaticTokenProvider,
    type TokenProvider,
} from './provider.js'
import { createFileTokenStore, defaultTokenPath } from './tokenStore.js'

export interface ResolvedAuth {
    provider: TokenProvider
    /** Human-readable description of the chosen source, for a startup log. */
    mode: string
}

/**
 * Choose a token source, in priority order:
 *   1. A cached token.json (from `auth` login). Refresh runs only when the user
 *      has their own app with a client secret; the embedded public client has
 *      no secret, so its ~1-year token is used statically (re-login on expiry).
 *   2. A static `YANDEX_METRIKA_TOKEN` from the environment.
 *   3. Otherwise, throw with actionable guidance.
 */
export function resolveTokenProvider(
    config: Config,
    env: NodeJS.ProcessEnv = process.env,
): ResolvedAuth {
    const store = createFileTokenStore(defaultTokenPath(env))
    const cached = store.read()

    if (cached) {
        // Refresh needs a client secret (Yandex rejects it otherwise), so it's
        // available only with the user's own app.
        if (config.oauthIsCustomApp && config.oauthClientSecret) {
            const oauth: OAuthClientConfig = {
                clientId: config.oauthClientId,
                clientSecret: config.oauthClientSecret,
                baseUrl: config.oauthBaseUrl,
            }
            return {
                provider: new RefreshingTokenProvider(
                    store,
                    oauth,
                    undefined,
                    cached,
                ),
                mode: `token file with refresh (${store.path})`,
            }
        }
        return {
            provider: new StaticTokenProvider(cached.accessToken),
            mode: `token file (${store.path}); ~1-year token, re-run \`auth\` when it expires`,
        }
    }

    if (config.token) {
        return {
            provider: new StaticTokenProvider(config.token),
            mode: 'static YANDEX_METRIKA_TOKEN',
        }
    }

    throw new Error(
        'No Yandex Metrica credentials found. Run `yandex-metrica-mcp auth` to ' +
            'sign in with your Yandex account, or set YANDEX_METRIKA_TOKEN to a ' +
            'static OAuth token.',
    )
}
