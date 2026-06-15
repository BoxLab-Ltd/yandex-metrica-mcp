/**
 * Yandex ID (OAuth) client for the device authorization grant and token
 * refresh. Pure functions over `fetch`; no MCP or filesystem dependencies.
 * Endpoints verified against yandex.com/dev/id (2026-06-15).
 */

const DEFAULT_OAUTH_BASE = 'https://oauth.yandex.com'

export interface OAuthClientConfig {
    clientId: string
    /** Required by Yandex for the token exchange and refresh. */
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

export interface DeviceCodeResponse {
    deviceCode: string
    userCode: string
    verificationUrl: string
    interval: number
    expiresIn: number
}

/** Pending result while the user has not yet entered the code. */
export interface DevicePending {
    pending: true
    slowDown?: boolean
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

/** Step 1: ask Yandex for a device code + user code to show the user. */
export async function requestDeviceCode(
    config: OAuthClientConfig,
    opts: { scope?: string } = {},
): Promise<DeviceCodeResponse> {
    const { status, data } = await postForm(config, '/device/code', {
        client_id: config.clientId,
        scope: opts.scope,
    })
    if (status !== 200 || typeof data.device_code !== 'string') {
        throw new OAuthError(
            typeof data.error === 'string' ? data.error : 'device_code_failed',
            typeof data.error_description === 'string'
                ? data.error_description
                : 'failed to obtain a device code',
        )
    }
    return {
        deviceCode: data.device_code,
        userCode: String(data.user_code ?? ''),
        verificationUrl: String(
            data.verification_url ?? data.verification_uri ?? '',
        ),
        interval: typeof data.interval === 'number' ? data.interval : 5,
        expiresIn: typeof data.expires_in === 'number' ? data.expires_in : 300,
    }
}

/** Step 2 (single attempt): exchange the device code for tokens. */
export async function exchangeDeviceCode(
    config: OAuthClientConfig,
    deviceCode: string,
    nowMs: number = Date.now(),
): Promise<TokenSet | DevicePending> {
    const { status, data } = await postForm(config, '/token', {
        grant_type: 'device_code',
        code: deviceCode,
        client_id: config.clientId,
        client_secret: config.clientSecret,
    })
    if (status === 200) return toTokenSet(data, nowMs)
    const error = typeof data.error === 'string' ? data.error : 'unknown_error'
    if (error === 'authorization_pending') return { pending: true }
    if (error === 'slow_down') return { pending: true, slowDown: true }
    throw new OAuthError(
        error,
        typeof data.error_description === 'string'
            ? data.error_description
            : 'token exchange failed',
    )
}

/** Step 2 (loop): poll until the user authorizes, the code expires, or errors. */
export async function pollForToken(
    config: OAuthClientConfig,
    device: DeviceCodeResponse,
    opts: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<TokenSet> {
    const sleep = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
    const now = opts.now ?? (() => Date.now())
    let intervalMs = device.interval * 1000
    const deadline = now() + device.expiresIn * 1000

    for (;;) {
        await sleep(intervalMs)
        if (now() > deadline) {
            throw new OAuthError(
                'expired_token',
                'device code expired before authorization',
            )
        }
        const result = await exchangeDeviceCode(
            config,
            device.deviceCode,
            now(),
        )
        if ('accessToken' in result) return result
        // RFC 8628: bump the interval by 5s on slow_down; cap for tidiness.
        if (result.slowDown) intervalMs = Math.min(intervalMs + 5000, 60_000)
    }
}

/** Exchange a refresh token for a fresh token set. */
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
