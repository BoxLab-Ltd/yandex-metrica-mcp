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
 *   1. A cached token.json (from `auth` login) — refreshing if OAuth client
 *      credentials are configured, otherwise used statically until it expires.
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
        if (config.oauthClientId && config.oauthClientSecret) {
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
            mode: `token file without refresh — set YANDEX_OAUTH_CLIENT_ID/SECRET to auto-refresh (${store.path})`,
        }
    }

    if (config.token) {
        return {
            provider: new StaticTokenProvider(config.token),
            mode: 'static YANDEX_METRIKA_TOKEN',
        }
    }

    throw new Error(
        'No Yandex Metrica credentials found. Either set YANDEX_METRIKA_TOKEN, ' +
            'or set YANDEX_OAUTH_CLIENT_ID and YANDEX_OAUTH_CLIENT_SECRET and run ' +
            '`yandex-metrica-mcp auth` to sign in.',
    )
}
