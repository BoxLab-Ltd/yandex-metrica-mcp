import { describe, expect, it, mock } from 'bun:test'
import { MetricaClient, Semaphore } from '../src/api/client.js'
import { MetricaApiError } from '../src/api/errors.js'

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function makeClient(fetchImpl: typeof fetch, overrides = {}) {
    return new MetricaClient({
        baseUrl: 'https://api-metrika.yandex.net',
        getToken: async () => 'tok',
        userAgent: 'test/1.0',
        maxConcurrency: 3,
        requestTimeoutMs: 1000,
        fetchImpl,
        sleep: async () => {}, // no real backoff delay in tests
        ...overrides,
    })
}

describe('MetricaClient request building', () => {
    it('sends the literal "OAuth" auth header and CSV-joined array params', async () => {
        let capturedUrl = ''
        let capturedHeaders: Record<string, string> = {}
        const fetchImpl = mock(
            async (url: string | URL | Request, init?: RequestInit) => {
                capturedUrl = String(url)
                capturedHeaders = (init?.headers ?? {}) as Record<
                    string,
                    string
                >
                return json(200, { data: [], total_rows: 0 })
            },
        ) as unknown as typeof fetch

        const client = makeClient(fetchImpl)
        await client.request('/stat/v1/data', {
            ids: [111, 222],
            metrics: ['ym:s:visits', 'ym:s:users'],
        })

        expect(capturedHeaders.Authorization).toBe('OAuth tok')
        expect(capturedUrl).toContain('ids=111%2C222')
        expect(capturedUrl).toContain(
            'metrics=ym%3As%3Avisits%2Cym%3As%3Ausers',
        )
    })

    it('omits undefined params and applies the default lang', async () => {
        let capturedUrl = ''
        const fetchImpl = mock(async (url: string | URL | Request) => {
            capturedUrl = String(url)
            return json(200, { data: [], total_rows: 0 })
        }) as unknown as typeof fetch

        const client = makeClient(fetchImpl, { lang: 'en' })
        await client.request('/stat/v1/data', {
            ids: 1,
            dimensions: undefined,
            filters: undefined,
        })

        expect(capturedUrl).toContain('lang=en')
        expect(capturedUrl).not.toContain('dimensions=')
        expect(capturedUrl).not.toContain('filters=')
    })
})

describe('MetricaClient retry/backoff', () => {
    it('retries on 429 (quota) then succeeds', async () => {
        let calls = 0
        const fetchImpl = mock(async () => {
            calls += 1
            if (calls < 3) {
                return json(429, {
                    errors: [
                        {
                            error_type: 'quota_requests_by_uid',
                            message: 'slow down',
                        },
                    ],
                })
            }
            return json(200, { data: [], total_rows: 0 })
        }) as unknown as typeof fetch

        const client = makeClient(fetchImpl)
        const result = await client.request('/stat/v1/data', { ids: 1 })
        expect(result).toEqual({ data: [], total_rows: 0 })
        expect(calls).toBe(3)
    })

    it('retries on the documented legacy 420 throttle status', async () => {
        let calls = 0
        const fetchImpl = mock(async () => {
            calls += 1
            if (calls < 2) return json(420, { message: 'Too Many Requests' })
            return json(200, { ok: true })
        }) as unknown as typeof fetch

        const client = makeClient(fetchImpl)
        await client.request('/stat/v1/data', { ids: 1 })
        expect(calls).toBe(2)
    })

    it('does not retry a non-retryable 400 and throws MetricaApiError', async () => {
        let calls = 0
        const fetchImpl = mock(async () => {
            calls += 1
            return json(400, {
                errors: [{ error_type: 'invalid_parameter', message: 'bad' }],
            })
        }) as unknown as typeof fetch

        const client = makeClient(fetchImpl)
        await expect(
            client.request('/stat/v1/data', { ids: 1 }),
        ).rejects.toMatchObject({
            name: 'MetricaApiError',
            status: 400,
        })
        expect(calls).toBe(1)
    })

    it('gives up after maxRetries and rethrows', async () => {
        const fetchImpl = mock(async () =>
            json(429, {
                errors: [
                    { error_type: 'quota_parallel_requests', message: 'busy' },
                ],
            }),
        ) as unknown as typeof fetch

        const client = makeClient(fetchImpl, { maxRetries: 2 })
        await expect(
            client.request('/stat/v1/data', { ids: 1 }),
        ).rejects.toBeInstanceOf(MetricaApiError)
        expect(fetchImpl).toHaveBeenCalledTimes(3) // initial + 2 retries
    })
})

describe('Semaphore', () => {
    it('never lets more than `max` run concurrently', async () => {
        const sem = new Semaphore(2)
        let active = 0
        let maxActive = 0
        const task = async () => {
            const release = await sem.acquire()
            active += 1
            maxActive = Math.max(maxActive, active)
            await new Promise(r => setTimeout(r, 5))
            active -= 1
            release()
        }
        await Promise.all(Array.from({ length: 6 }, task))
        expect(maxActive).toBeLessThanOrEqual(2)
    })
})

describe('MetricaClient concurrency', () => {
    it('caps in-flight requests at maxConcurrency', async () => {
        let inFlight = 0
        let peak = 0
        const fetchImpl = mock(async () => {
            inFlight += 1
            peak = Math.max(peak, inFlight)
            await new Promise(r => setTimeout(r, 5))
            inFlight -= 1
            return json(200, { ok: true })
        }) as unknown as typeof fetch

        const client = makeClient(fetchImpl, { maxConcurrency: 2 })
        await Promise.all(
            Array.from({ length: 6 }, () =>
                client.request('/stat/v1/data', { ids: 1 }),
            ),
        )
        expect(peak).toBeLessThanOrEqual(2)
    })
})
