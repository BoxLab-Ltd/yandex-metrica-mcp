import { describe, expect, it } from 'bun:test'
import { errorFromResponse, MetricaApiError } from '../src/api/errors.js'

describe('errorFromResponse', () => {
    it('parses access_denied (403) as a non-retryable error', () => {
        const err = errorFromResponse(
            403,
            JSON.stringify({
                errors: [{ error_type: 'access_denied', message: 'no grant' }],
                code: 403,
            }),
        )
        expect(err.status).toBe(403)
        expect(err.errorTypes).toContain('access_denied')
        expect(err.isThrottled).toBe(false)
        expect(err.isRetryable).toBe(false)
        expect(err.message).toContain('access_denied')
    })

    it('treats quota errors (429) as throttled and retryable', () => {
        const err = errorFromResponse(
            429,
            JSON.stringify({
                errors: [
                    { error_type: 'quota_requests_by_uid', message: 'slow' },
                ],
            }),
        )
        expect(err.isThrottled).toBe(true)
        expect(err.isRetryable).toBe(true)
    })

    it('treats the legacy 420 status as throttled even without a body', () => {
        const err = errorFromResponse(420, 'Too Many Requests')
        expect(err.isThrottled).toBe(true)
        expect(err.isRetryable).toBe(true)
    })

    it('marks 503/504 as retryable server errors', () => {
        expect(new MetricaApiError(503, 'x').isRetryable).toBe(true)
        expect(new MetricaApiError(504, 'x').isRetryable).toBe(true)
        expect(new MetricaApiError(404, 'x').isRetryable).toBe(false)
    })
})
