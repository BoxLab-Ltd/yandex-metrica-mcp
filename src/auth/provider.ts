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
    /** Adopt a token set from an in-process login, updating the live token. */
    setTokens?(tokens: TokenSet): void
}

/** A fixed token (env var). Immutable — CI/static use, not the login flow. */
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

export const NOT_AUTHENTICATED_MESSAGE =
    'Not signed in to Yandex Metrica. Use the `login` tool to sign in (it opens ' +
    'your browser), or run `yandex-metrica-mcp auth` in a terminal.'

/**
 * Holds a cached access token that may be absent at startup, so the server can
 * boot before the first sign-in. Yields the token once present (adopted via
 * {@link setTokens} after `login`, or read from the store if one landed there
 * out of band); otherwise throws actionable guidance instead of crashing.
 */
export class SessionTokenProvider implements TokenProvider {
    constructor(
        private token: string | null,
        private readonly store?: TokenStore,
    ) {}

    async getAccessToken(): Promise<string> {
        if (this.token) return this.token
        const cached = this.store?.read()
        if (cached?.accessToken) {
            this.token = cached.accessToken
            return this.token
        }
        throw new Error(NOT_AUTHENTICATED_MESSAGE)
    }

    async forceRefresh(): Promise<string> {
        return this.getAccessToken()
    }

    canRefresh(): boolean {
        return false
    }

    setTokens(tokens: TokenSet): void {
        this.token = tokens.accessToken
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

    setTokens(tokens: TokenSet): void {
        this.current = tokens
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
