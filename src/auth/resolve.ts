import type { Config } from '../config.js'
import type { OAuthClientConfig } from './oauth.js'
import {
    RefreshingTokenProvider,
    SessionTokenProvider,
    StaticTokenProvider,
    type TokenProvider,
} from './provider.js'
import {
    createFileTokenStore,
    defaultTokenPath,
    type TokenStore,
} from './tokenStore.js'

export interface ResolvedAuth {
    provider: TokenProvider
    /** The token cache, so `login` can persist a freshly obtained token set. */
    store: TokenStore
    /** Human-readable description of the chosen source, for a startup log. */
    mode: string
}

/**
 * Choose a token source, in priority order:
 *   1. A cached token.json (from `auth` login). Refresh runs only when the user
 *      has their own app with a client secret; the embedded public client has
 *      no secret, so its ~1-year token is used as-is (re-login on expiry).
 *   2. A static `YANDEX_METRIKA_TOKEN` from the environment.
 *   3. Otherwise, boot unauthenticated — tool calls fail with actionable
 *      guidance until the user runs `login`, rather than the server refusing
 *      to start (so an installed-but-not-signed-in setup can log in in place).
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
                store,
                mode: `token file with refresh (${store.path})`,
            }
        }
        return {
            provider: new SessionTokenProvider(cached.accessToken, store),
            store,
            mode: `token file (${store.path}); ~1-year token, re-run \`auth\` when it expires`,
        }
    }

    if (config.token) {
        return {
            provider: new StaticTokenProvider(config.token),
            store,
            mode: 'static YANDEX_METRIKA_TOKEN',
        }
    }

    return {
        provider: new SessionTokenProvider(null, store),
        store,
        mode: 'not signed in — use the `login` tool or run `yandex-metrica-mcp auth`',
    }
}
