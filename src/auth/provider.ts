import { refreshToken, type OAuthClientConfig, type TokenSet } from './oauth.js'
import type { TokenStore } from './tokenStore.js'

/** Supplies a valid access token to the API client, refreshing as needed. */
export interface TokenProvider {
    getAccessToken(): Promise<string>
    /**
     * Reactively obtain a token after one was rejected (HTTP 401). `rejected`
     * is the token that failed, so the provider can skip the network call if it
     * has already rotated to a different one.
     */
    forceRefresh(rejected?: string): Promise<string>
    /** Whether forceRefresh could ever yield a different token. */
    canRefresh(): boolean
}

/** A fixed token (env var or a cached access token without refresh creds). */
export class StaticTokenProvider implements TokenProvider {
    constructor(private readonly token: string) {}
    async getAccessToken(): Promise<string> {
        return this.token
    }
    async forceRefresh(): Promise<string> {
        return this.token
    }
    canRefresh(): boolean {
        return false
    }
}

/** Refresh slightly before expiry to avoid racing the boundary. */
const EXPIRY_SKEW_MS = 60_000

/**
 * Holds a cached {@link TokenSet}, returns the access token while valid, and
 * refreshes (single-flight) when it nears expiry or on demand. Persists every
 * refreshed set back to the store, keeping the old refresh token if Yandex
 * omits a rotated one.
 */
export class RefreshingTokenProvider implements TokenProvider {
    private current: TokenSet | null
    private inFlight: Promise<string> | null = null

    constructor(
        private readonly store: TokenStore,
        private readonly oauth: OAuthClientConfig,
        private readonly now: () => number = () => Date.now(),
        initial?: TokenSet | null,
    ) {
        this.current = initial ?? store.read()
    }

    async getAccessToken(): Promise<string> {
        const ts = this.current
        if (ts && this.now() < ts.expiresAt - EXPIRY_SKEW_MS) {
            return ts.accessToken
        }
        return this.refresh()
    }

    async forceRefresh(rejected?: string): Promise<string> {
        // If another caller already rotated past the rejected token, reuse it
        // instead of issuing a redundant (and refresh-token-churning) refresh.
        if (
            rejected !== undefined &&
            this.current &&
            this.current.accessToken !== rejected
        ) {
            return this.current.accessToken
        }
        return this.refresh()
    }

    canRefresh(): boolean {
        return true
    }

    private refresh(): Promise<string> {
        // Single-flight: concurrent callers share one refresh round-trip.
        if (!this.inFlight) {
            this.inFlight = this.doRefresh().finally(() => {
                this.inFlight = null
            })
        }
        return this.inFlight
    }

    private async doRefresh(): Promise<string> {
        const refresh = this.current?.refreshToken
        if (!refresh) {
            throw new Error(
                'No refresh token available. Run `yandex-metrica-mcp auth` to sign in.',
            )
        }
        const next = await refreshToken(this.oauth, refresh, this.now())
        const merged: TokenSet = {
            ...next,
            refreshToken: next.refreshToken ?? refresh,
        }
        this.current = merged
        this.store.write(merged)
        return merged.accessToken
    }
}
