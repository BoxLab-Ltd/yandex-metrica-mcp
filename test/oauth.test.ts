import { describe, expect, it } from 'bun:test'
import {
    exchangeDeviceCode,
    refreshToken,
    requestDeviceCode,
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
        clientSecret: 'sec',
        baseUrl: 'https://oauth.test',
        fetchImpl: handler as unknown as typeof fetch,
    }
}

describe('requestDeviceCode', () => {
    it('posts client_id + scope and parses the device response', async () => {
        let url = ''
        let body = ''
        const cfg = configWith(async (u, init) => {
            url = u
            body = String(init.body)
            return jsonResponse(200, {
                device_code: 'dc',
                user_code: 'ABCD',
                verification_url: 'https://ya/device',
                interval: 5,
                expires_in: 300,
            })
        })
        const d = await requestDeviceCode(cfg, { scope: 'metrika:read' })
        expect(url).toBe('https://oauth.test/device/code')
        expect(body).toContain('client_id=cid')
        expect(body).toContain('scope=metrika%3Aread')
        expect(d).toMatchObject({
            deviceCode: 'dc',
            userCode: 'ABCD',
            verificationUrl: 'https://ya/device',
            interval: 5,
            expiresIn: 300,
        })
    })
})

describe('exchangeDeviceCode', () => {
    it('returns pending on authorization_pending', async () => {
        const cfg = configWith(async () =>
            jsonResponse(400, { error: 'authorization_pending' }),
        )
        expect(await exchangeDeviceCode(cfg, 'dc', 1000)).toEqual({
            pending: true,
        })
    })

    it('returns a token set with computed expiresAt on success', async () => {
        const cfg = configWith(async () =>
            jsonResponse(200, {
                access_token: 'AT',
                refresh_token: 'RT',
                expires_in: 3600,
                scope: 'metrika:read',
            }),
        )
        expect(await exchangeDeviceCode(cfg, 'dc', 1000)).toMatchObject({
            accessToken: 'AT',
            refreshToken: 'RT',
            expiresAt: 1000 + 3600 * 1000,
            scope: 'metrika:read',
        })
    })
})

describe('refreshToken', () => {
    it('posts grant_type=refresh_token and parses the new set', async () => {
        let body = ''
        const cfg = configWith(async (_u, init) => {
            body = String(init.body)
            return jsonResponse(200, {
                access_token: 'AT2',
                refresh_token: 'RT2',
                expires_in: 7200,
            })
        })
        const r = await refreshToken(cfg, 'RT', 2000)
        expect(body).toContain('grant_type=refresh_token')
        expect(body).toContain('refresh_token=RT')
        expect(r).toMatchObject({
            accessToken: 'AT2',
            refreshToken: 'RT2',
            expiresAt: 2000 + 7200 * 1000,
        })
    })

    it('throws OAuthError on an error response', async () => {
        const cfg = configWith(async () =>
            jsonResponse(400, {
                error: 'invalid_grant',
                error_description: 'bad',
            }),
        )
        await expect(refreshToken(cfg, 'RT', 0)).rejects.toMatchObject({
            name: 'OAuthError',
            code: 'invalid_grant',
        })
    })
})
