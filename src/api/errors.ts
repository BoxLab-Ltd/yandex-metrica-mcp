import { z } from 'zod'

/** Shape of a Yandex Metrica API error body (see docs/API-NOTES.md). */
export const ApiErrorBodySchema = z.object({
    errors: z
        .array(
            z.object({
                error_type: z.string(),
                message: z.string(),
                location: z.string().optional(),
            }),
        )
        .optional(),
    code: z.number().optional(),
    message: z.string().optional(),
})

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>

/**
 * An error returned by the Metrica API (non-2xx response) or raised while
 * talking to it. Carries the HTTP status and the parsed `error_type`(s) so
 * callers and the retry layer can branch on them.
 */
export class MetricaApiError extends Error {
    readonly status: number
    readonly errorTypes: string[]
    readonly body?: ApiErrorBody

    constructor(
        status: number,
        message: string,
        errorTypes: string[] = [],
        body?: ApiErrorBody,
    ) {
        super(message)
        this.name = 'MetricaApiError'
        this.status = status
        this.errorTypes = errorTypes
        this.body = body
    }

    /** True when the API throttled us (quota). Docs disagree on 420 vs 429. */
    get isThrottled(): boolean {
        return (
            this.status === 429 ||
            this.status === 420 ||
            this.errorTypes.some(t => t.startsWith('quota_'))
        )
    }

    /** Transient server-side conditions worth retrying. */
    get isRetryableServerError(): boolean {
        return this.status === 503 || this.status === 504
    }

    /** Whether retrying this request could plausibly succeed. */
    get isRetryable(): boolean {
        return this.isThrottled || this.isRetryableServerError
    }
}

/** Build a MetricaApiError from a non-2xx Response and its (maybe-JSON) body. */
export function errorFromResponse(
    status: number,
    rawBody: string,
): MetricaApiError {
    let body: ApiErrorBody | undefined
    try {
        body = ApiErrorBodySchema.parse(JSON.parse(rawBody))
    } catch {
        body = undefined
    }
    const errorTypes = body?.errors?.map(e => e.error_type) ?? []
    const detail =
        body?.errors?.map(e => `${e.error_type}: ${e.message}`).join('; ') ||
        body?.message ||
        rawBody.slice(0, 500) ||
        'Unknown error'
    return new MetricaApiError(
        status,
        `Metrica API ${status}: ${detail}`,
        errorTypes,
        body,
    )
}
