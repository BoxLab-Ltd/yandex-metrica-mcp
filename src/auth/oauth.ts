/**
 * Yandex ID (OAuth) client for the authorization-code + PKCE flow and token
 * refresh. Pure functions over `fetch`; no MCP or filesystem dependencies.
 * Endpoints verified live against oauth.yandex.com (2026-06-16).
 *
 * Design note: PKCE (authorization-code) works WITHOUT a client secret and
 * yields a ~1-year token, so the public client ships only a client_id. The
 * device grant and refresh both require the secret, so refresh is available
 * only when the user supplies their own app's client_secret. Two redirect
 * transports are supported (see auth/login.ts): a loopback redirect
 * (`http://127.0.0.1:<port>` — the browser returns the code automatically) and
 * the out-of-band `verification_code` redirect (fallback — the user copies the
 * code shown after consent). Loopback needs the OAuth app to allow that
 * redirect URI (a web-app-type client with the port registered).
 */

const DEFAULT_OAUTH_BASE = 'https://oauth.yandex.com'

/** The out-of-band redirect that shows the code on a page for the user to copy. */
export const OOB_REDIRECT_URI = 'https://oauth.yandex.com/verification_code'

export interface OAuthClientConfig {
    clientId: string
    /** Only needed for the refresh grant (i.e. a user's own app). */
    clientSecret?: string
    /** Override for tests; defaults to https://oauth.yandex.com. */
    baseUrl?: string
    /** Injectable for tests. Defaults to global `fetch`. */
    fetchImpl?: typeof fetch
}

/** Stored credential set. `expiresAt` is epoch milliseconds. */
export interface TokenSet {
    accessToken: string
    refreshToken?: string
    expiresAt: number
    scope?: string
}

export class OAuthError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(`${code}: ${message}`)
        this.name = 'OAuthError'
    }
}

function baseUrl(config: OAuthClientConfig): string {
    return config.baseUrl ?? DEFAULT_OAUTH_BASE
}

async function postForm(
    config: OAuthClientConfig,
    path: string,
    params: Record<string, string | undefined>,
): Promise<{ status: number; data: Record<string, unknown> }> {
    const fetchImpl = config.fetchImpl ?? fetch
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) body.set(k, v)
    }
    const res = await fetchImpl(`${baseUrl(config)}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    })
    const text = await res.text()
    let data: Record<string, unknown> = {}
    try {
        data = JSON.parse(text) as Record<string, unknown>
    } catch {
        if (!res.ok) {
            throw new OAuthError(
                'http_error',
                `${res.status}: ${text.slice(0, 300)}`,
            )
        }
    }
    return { status: res.status, data }
}

function toTokenSet(data: Record<string, unknown>, nowMs: number): TokenSet {
    const accessToken = data.access_token
    if (typeof accessToken !== 'string') {
        throw new OAuthError(
            'invalid_response',
            'token response had no access_token',
        )
    }
    // Yandex always returns expires_in; default to 1h defensively so a token
    // without it is still usable rather than treated as already expired.
    const expiresIn =
        typeof data.expires_in === 'number' ? data.expires_in : 3600
    return {
        accessToken,
        refreshToken:
            typeof data.refresh_token === 'string'
                ? data.refresh_token
                : undefined,
        expiresAt: nowMs + expiresIn * 1000,
        scope: typeof data.scope === 'string' ? data.scope : undefined,
    }
}

export interface AuthorizeUrlParams {
    codeChallenge: string
    scope?: string
    /** Defaults to the out-of-band `verification_code` redirect. */
    redirectUri?: string
    state?: string
}

/** Build the `/authorize` URL the user opens to grant access (PKCE, S256). */
export function buildAuthorizeUrl(
    config: OAuthClientConfig,
    params: AuthorizeUrlParams,
): string {
    const q = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: params.redirectUri ?? OOB_REDIRECT_URI,
        code_challenge: params.codeChallenge,
        code_challenge_method: 'S256',
    })
    if (params.scope) q.set('scope', params.scope)
    if (params.state) q.set('state', params.state)
    return `${baseUrl(config)}/authorize?${q.toString()}`
}

/** Exchange an authorization code for tokens using PKCE (no secret required). */
export async function exchangeCode(
    config: OAuthClientConfig,
    params: { code: string; codeVerifier: string; redirectUri?: string },
    nowMs: number = Date.now(),
): Promise<TokenSet> {
    const { status, data } = await postForm(config, '/token', {
        grant_type: 'authorization_code',
        code: params.code,
        client_id: config.clientId,
        code_verifier: params.codeVerifier,
        redirect_uri: params.redirectUri ?? OOB_REDIRECT_URI,
        // Sent only if the user configured their own app with a secret.
        client_secret: config.clientSecret,
    })
    if (status !== 200) {
        throw new OAuthError(
            typeof data.error === 'string'
                ? data.error
                : 'token_exchange_failed',
            typeof data.error_description === 'string'
                ? data.error_description
                : 'failed to exchange the authorization code',
        )
    }
    return toTokenSet(data, nowMs)
}

/**
 * Exchange a refresh token for a fresh token set. Requires `clientSecret`
 * (Yandex rejects refresh without it), so this is only used for a user's own
 * app — the embedded public client relies on the ~1-year token + re-login.
 */
export async function refreshToken(
    config: OAuthClientConfig,
    refresh: string,
    nowMs: number = Date.now(),
): Promise<TokenSet> {
    const { status, data } = await postForm(config, '/token', {
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: config.clientId,
        client_secret: config.clientSecret,
    })
    if (status !== 200) {
        throw new OAuthError(
            typeof data.error === 'string' ? data.error : 'refresh_failed',
            typeof data.error_description === 'string'
                ? data.error_description
                : 'failed to refresh token',
        )
    }
    return toTokenSet(data, nowMs)
}
