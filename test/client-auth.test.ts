import { describe, expect, it } from 'bun:test'
import { MetricaClient } from '../src/api/client.js'

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

describe('MetricaClient reactive auth refresh', () => {
    it('refreshes once on 401/invalid_token and retries with the new token', async () => {
        let calls = 0
        let token = 'stale'
        let rejectedSeen: string | undefined
        const sentTokens: string[] = []
        const fetchImpl = (async (_url: string, init: RequestInit) => {
            calls += 1
            sentTokens.push(
                String((init.headers as Record<string, string>).Authorization),
            )
            if (calls === 1) {
                return json(403, {
                    errors: [
                        { error_type: 'invalid_token', message: 'expired' },
                    ],
                })
            }
            return json(200, { ok: true })
        }) as unknown as typeof fetch

        const client = new MetricaClient({
            baseUrl: 'https://api-metrika.yandex.net',
            getToken: async () => token,
            onUnauthorized: async rejected => {
                rejectedSeen = rejected
                token = 'fresh'
                return token
            },
            canRefresh: () => true,
            userAgent: 'test/1.0',
            maxConcurrency: 1,
            requestTimeoutMs: 1000,
            fetchImpl,
            sleep: async () => {},
        })

        const result = await client.request('/stat/v1/data', { ids: 1 })
        expect(result).toEqual({ ok: true })
        expect(rejectedSeen).toBe('stale')
        expect(calls).toBe(2)
        expect(sentTokens).toEqual(['OAuth stale', 'OAuth fresh'])
    })

    it('only retries auth once, then surfaces the error', async () => {
        let calls = 0
        const fetchImpl = (async () => {
            calls += 1
            return json(401, {
                errors: [{ error_type: 'invalid_token', message: 'nope' }],
            })
        }) as unknown as typeof fetch

        const client = new MetricaClient({
            baseUrl: 'https://api-metrika.yandex.net',
            getToken: async () => 't',
            onUnauthorized: async () => 't',
            canRefresh: () => true,
            userAgent: 'test/1.0',
            maxConcurrency: 1,
            requestTimeoutMs: 1000,
            fetchImpl,
            sleep: async () => {},
        })

        await expect(client.request('/p', {})).rejects.toMatchObject({
            status: 401,
        })
        expect(calls).toBe(2) // initial + one auth retry, then give up
    })

    it('skips the doomed retry when canRefresh is false (static token)', async () => {
        let calls = 0
        let refreshCalled = false
        const fetchImpl = (async () => {
            calls += 1
            return json(401, {
                errors: [{ error_type: 'invalid_token', message: 'nope' }],
            })
        }) as unknown as typeof fetch

        const client = new MetricaClient({
            baseUrl: 'https://api-metrika.yandex.net',
            getToken: async () => 'static',
            onUnauthorized: async () => {
                refreshCalled = true
                return 'static'
            },
            canRefresh: () => false,
            userAgent: 'test/1.0',
            maxConcurrency: 1,
            requestTimeoutMs: 1000,
            fetchImpl,
            sleep: async () => {},
        })

        await expect(client.request('/p', {})).rejects.toMatchObject({
            status: 401,
        })
        expect(refreshCalled).toBe(false)
        expect(calls).toBe(1) // no wasted retry
    })

    it('surfaces the original 401, not the refresh error, when refresh fails', async () => {
        const fetchImpl = (async () =>
            json(401, {
                errors: [{ error_type: 'invalid_token', message: 'orig' }],
            })) as unknown as typeof fetch

        const client = new MetricaClient({
            baseUrl: 'https://api-metrika.yandex.net',
            getToken: async () => 't',
            onUnauthorized: async () => {
                throw new Error('refresh blew up')
            },
            canRefresh: () => true,
            userAgent: 'test/1.0',
            maxConcurrency: 1,
            requestTimeoutMs: 1000,
            fetchImpl,
            sleep: async () => {},
        })

        await expect(client.request('/p', {})).rejects.toMatchObject({
            name: 'MetricaApiError',
            status: 401,
        })
    })
})
