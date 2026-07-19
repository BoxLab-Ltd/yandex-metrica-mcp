import { describe, expect, it } from 'bun:test'
import type { OAuthClientConfig, TokenSet } from '../src/auth/oauth.js'
import {
    RefreshingTokenProvider,
    SessionTokenProvider,
    StaticTokenProvider,
} from '../src/auth/provider.js'
import type { TokenStore } from '../src/auth/tokenStore.js'

function memStore(
    initial: TokenSet | null,
): TokenStore & { written: TokenSet[] } {
    let current = initial
    const written: TokenSet[] = []
    return {
        path: ':memory:',
        read: () => current,
        write: (t: TokenSet) => {
            current = t
            written.push(t)
        },
        written,
    }
}

function oauthReturning(
    body: Record<string, unknown>,
    delayMs = 0,
): OAuthClientConfig {
    const handler = async (): Promise<Response> => {
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs))
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })
    }
    return {
        clientId: 'c',
        clientSecret: 's',
        baseUrl: 'https://oauth.test',
        fetchImpl: handler as unknown as typeof fetch,
    }
}

const fresh: TokenSet = {
    accessToken: 'AT',
    refreshToken: 'RT',
    expiresAt: 10_000_000,
}

describe('StaticTokenProvider', () => {
    it('always returns the fixed token', async () => {
        const p = new StaticTokenProvider('tok')
        expect(await p.getAccessToken()).toBe('tok')
        expect(await p.forceRefresh()).toBe('tok')
    })
})

describe('SessionTokenProvider', () => {
    it('throws actionable guidance when no token is present', async () => {
        const p = new SessionTokenProvider(null, memStore(null))
        await expect(p.getAccessToken()).rejects.toThrow(/not signed in/i)
        expect(p.canRefresh()).toBe(false)
    })

    it('returns a token adopted via setTokens (in-process login)', async () => {
        const p = new SessionTokenProvider(null, memStore(null))
        p.setTokens({ accessToken: 'LIVE', expiresAt: 0 })
        expect(await p.getAccessToken()).toBe('LIVE')
    })

    it('lazily picks up a token written to the store after boot', async () => {
        const store = memStore(null)
        const p = new SessionTokenProvider(null, store)
        store.write({ accessToken: 'FROM_DISK', expiresAt: 0 })
        expect(await p.getAccessToken()).toBe('FROM_DISK')
    })

    it('returns its seeded token without a store', async () => {
        const p = new SessionTokenProvider('SEED')
        expect(await p.getAccessToken()).toBe('SEED')
    })
})

describe('RefreshingTokenProvider', () => {
    it('returns the cached token while still valid (no network)', async () => {
        let calls = 0
        const oauth = oauthReturning({ access_token: 'NEW', expires_in: 3600 })
        const counting: OAuthClientConfig = {
            ...oauth,
            fetchImpl: (async (...args: unknown[]) => {
                calls += 1
                return (
                    oauth.fetchImpl as (...a: unknown[]) => Promise<Response>
                )(...args)
            }) as unknown as typeof fetch,
        }
        const p = new RefreshingTokenProvider(
            memStore(fresh),
            counting,
            () => 0,
            fresh,
        )
        expect(await p.getAccessToken()).toBe('AT')
        expect(calls).toBe(0)
    })

    it('refreshes when expired and persists the rotated set', async () => {
        const store = memStore(fresh)
        const oauth = oauthReturning({
            access_token: 'NEW',
            refresh_token: 'RT2',
            expires_in: 3600,
        })
        const p = new RefreshingTokenProvider(
            store,
            oauth,
            () => 20_000_000,
            fresh,
        )
        expect(await p.getAccessToken()).toBe('NEW')
        expect(store.written[0]).toMatchObject({
            accessToken: 'NEW',
            refreshToken: 'RT2',
        })
    })

    it('keeps the old refresh token if the response omits one', async () => {
        const store = memStore(fresh)
        const oauth = oauthReturning({ access_token: 'NEW', expires_in: 3600 })
        const p = new RefreshingTokenProvider(
            store,
            oauth,
            () => 20_000_000,
            fresh,
        )
        await p.getAccessToken()
        expect(store.written[0]?.refreshToken).toBe('RT')
    })

    it('coalesces concurrent refreshes into one request (single-flight)', async () => {
        let calls = 0
        const base = oauthReturning(
            { access_token: 'NEW', refresh_token: 'RT2', expires_in: 3600 },
            5,
        )
        const oauth: OAuthClientConfig = {
            ...base,
            fetchImpl: (async (...args: unknown[]) => {
                calls += 1
                return (
                    base.fetchImpl as (...a: unknown[]) => Promise<Response>
                )(...args)
            }) as unknown as typeof fetch,
        }
        const p = new RefreshingTokenProvider(
            memStore(fresh),
            oauth,
            () => 20_000_000,
            fresh,
        )
        const tokens = await Promise.all([
            p.getAccessToken(),
            p.getAccessToken(),
            p.getAccessToken(),
        ])
        expect(tokens).toEqual(['NEW', 'NEW', 'NEW'])
        expect(calls).toBe(1)
    })

    it('forceRefresh reuses an already-rotated token instead of refreshing again', async () => {
        let calls = 0
        const store = memStore(fresh)
        const base = oauthReturning({
            access_token: 'NEW',
            refresh_token: 'RT2',
            expires_in: 3600,
        })
        const oauth: OAuthClientConfig = {
            ...base,
            fetchImpl: (async (...args: unknown[]) => {
                calls += 1
                return (
                    base.fetchImpl as (...a: unknown[]) => Promise<Response>
                )(...args)
            }) as unknown as typeof fetch,
        }
        const p = new RefreshingTokenProvider(store, oauth, () => 0, fresh)
        // First reactive refresh after 'AT' was rejected → one network call.
        expect(await p.forceRefresh('AT')).toBe('NEW')
        // A second, staggered 401 still carrying 'AT' → cache already moved on.
        expect(await p.forceRefresh('AT')).toBe('NEW')
        expect(calls).toBe(1)
    })

    it('static provider cannot refresh; refreshing provider can', () => {
        expect(new StaticTokenProvider('t').canRefresh()).toBe(false)
        const p = new RefreshingTokenProvider(
            memStore(fresh),
            oauthReturning({ access_token: 'x', expires_in: 1 }),
            () => 0,
            fresh,
        )
        expect(p.canRefresh()).toBe(true)
    })

    it('throws a clear error when no refresh token is available', async () => {
        const noRefresh: TokenSet = { accessToken: 'AT', expiresAt: 0 }
        const oauth = oauthReturning({ access_token: 'x', expires_in: 1 })
        const p = new RefreshingTokenProvider(
            memStore(noRefresh),
            oauth,
            () => 1_000_000,
            noRefresh,
        )
        await expect(p.getAccessToken()).rejects.toThrow(/refresh token/)
    })
})
