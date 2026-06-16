import { describe, expect, it } from 'bun:test'
import {
    buildAuthorizeUrl,
    exchangeCode,
    OOB_REDIRECT_URI,
    refreshToken,
    type OAuthClientConfig,
} from '../src/auth/oauth.js'

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function configWith(
    handler: (url: string, init: RequestInit) => Promise<Response>,
): OAuthClientConfig {
    return {
        clientId: 'cid',
        baseUrl: 'https://oauth.test',
        fetchImpl: handler as unknown as typeof fetch,
    }
}

describe('buildAuthorizeUrl', () => {
    it('builds a PKCE authorize URL with the out-of-band redirect', () => {
        const url = new URL(
            buildAuthorizeUrl(
                configWith(async () => jsonResponse(200, {})),
                {
                    codeChallenge: 'CH',
                    scope: 'metrika:read',
                },
            ),
        )
        expect(url.origin + url.pathname).toBe('https://oauth.test/authorize')
        expect(url.searchParams.get('response_type')).toBe('code')
        expect(url.searchParams.get('client_id')).toBe('cid')
        expect(url.searchParams.get('code_challenge')).toBe('CH')
        expect(url.searchParams.get('code_challenge_method')).toBe('S256')
        expect(url.searchParams.get('redirect_uri')).toBe(OOB_REDIRECT_URI)
        expect(url.searchParams.get('scope')).toBe('metrika:read')
    })
})

describe('exchangeCode', () => {
    it('posts grant_type=authorization_code with code_verifier and no secret', async () => {
        let body = ''
        const cfg = configWith(async (_u, init) => {
            body = String(init.body)
            return jsonResponse(200, {
                access_token: 'AT',
                refresh_token: 'RT',
                expires_in: 31_500_000,
                scope: 'metrika:read',
            })
        })
        const tokens = await exchangeCode(
            cfg,
            { code: 'abc', codeVerifier: 'verifier123' },
            1000,
        )
        expect(body).toContain('grant_type=authorization_code')
        expect(body).toContain('code=abc')
        expect(body).toContain('code_verifier=verifier123')
        expect(body).not.toContain('client_secret')
        expect(tokens).toMatchObject({
            accessToken: 'AT',
            refreshToken: 'RT',
            expiresAt: 1000 + 31_500_000 * 1000,
            scope: 'metrika:read',
        })
    })

    it('throws OAuthError on an error response', async () => {
        const cfg = configWith(async () =>
            jsonResponse(400, {
                error: 'invalid_grant',
                error_description: 'expired code',
            }),
        )
        await expect(
            exchangeCode(cfg, { code: 'x', codeVerifier: 'y' }, 0),
        ).rejects.toMatchObject({ name: 'OAuthError', code: 'invalid_grant' })
    })
})

describe('refreshToken', () => {
    it('posts grant_type=refresh_token with the secret (own-app path)', async () => {
        let body = ''
        const cfg: OAuthClientConfig = {
            clientId: 'cid',
            clientSecret: 'sec',
            baseUrl: 'https://oauth.test',
            fetchImpl: (async (_u: string, init: RequestInit) => {
                body = String(init.body)
                return jsonResponse(200, {
                    access_token: 'AT2',
                    refresh_token: 'RT2',
                    expires_in: 7200,
                })
            }) as unknown as typeof fetch,
        }
        const r = await refreshToken(cfg, 'RT', 2000)
        expect(body).toContain('grant_type=refresh_token')
        expect(body).toContain('refresh_token=RT')
        expect(body).toContain('client_secret=sec')
        expect(r).toMatchObject({
            accessToken: 'AT2',
            refreshToken: 'RT2',
            expiresAt: 2000 + 7200 * 1000,
        })
    })
})
