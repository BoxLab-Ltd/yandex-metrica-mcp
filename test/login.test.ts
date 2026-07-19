import { describe, expect, it } from 'bun:test'
import { interactiveLogin } from '../src/auth/login.js'
import type { OAuthClientConfig } from '../src/auth/oauth.js'

/** A fetch that only answers the PKCE token exchange with a fixed token. */
const fakeTokenFetch = (async (url: string | URL) => {
    if (String(url).endsWith('/token')) {
        return new Response(
            JSON.stringify({
                access_token: 'tok',
                expires_in: 3600,
                scope: 'metrika:read',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
    }
    return new Response('not found', { status: 404 })
}) as unknown as typeof fetch

const oauth: OAuthClientConfig = {
    clientId: 'client-abc',
    baseUrl: 'https://oauth.example',
    fetchImpl: fakeTokenFetch,
}

describe('interactiveLogin', () => {
    it('completes the loopback flow when the browser returns the code', async () => {
        const tokens = await interactiveLogin({
            oauth,
            loopbackPort: 54620,
            // Simulate Yandex redirecting the browser back to the loopback URL.
            openUrl: authUrl => {
                const u = new URL(authUrl)
                const redirect = u.searchParams.get('redirect_uri')!
                const state = u.searchParams.get('state')!
                void fetch(`${redirect}?code=THECODE&state=${state}`).then(r =>
                    r.text(),
                )
            },
            promptForCode: () => {
                throw new Error('OOB prompt should not run on the loopback path')
            },
        })
        expect(tokens.accessToken).toBe('tok')
        expect(tokens.scope).toBe('metrika:read')
    })

    it('falls back to copy-paste when forced', async () => {
        const tokens = await interactiveLogin({
            oauth,
            loopbackPort: 1,
            forceOob: true,
            openUrl: () => {},
            promptForCode: async () => 'PASTED-CODE',
        })
        expect(tokens.accessToken).toBe('tok')
    })

    it('throws in copy-paste mode without a prompt handler', async () => {
        await expect(
            interactiveLogin({
                oauth,
                loopbackPort: 1,
                forceOob: true,
                openUrl: () => {},
            }),
        ).rejects.toThrow(/copy-paste handler/)
    })
})
