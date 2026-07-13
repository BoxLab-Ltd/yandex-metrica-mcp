import { errorFromResponse, MetricaApiError } from './errors.js'

/** Query parameter values accepted by the client; arrays become CSV. */
export type QueryParams = Record<
    string,
    string | number | boolean | Array<string | number> | undefined
>

export interface MetricaClientOptions {
    baseUrl: string
    /** Supplies the current access token; awaited on every request. */
    getToken: () => Promise<string>
    /**
     * Optional hook invoked once when a request fails with 401/invalid_token,
     * before a single retry — lets a token provider refresh reactively. Gets the
     * token that was rejected; resolves to a fresh token to retry with.
     */
    onUnauthorized?: (rejectedToken: string) => Promise<string>
    /** Whether a reactive refresh could ever yield a different token. */
    canRefresh?: () => boolean
    userAgent: string
    /** Max in-flight requests (Metrica allows 3 concurrent per user). */
    maxConcurrency: number
    requestTimeoutMs: number
    /** Default `lang` applied when a call does not specify one. */
    lang?: string
    /** Injectable for tests. Defaults to global `fetch`. */
    fetchImpl?: typeof fetch
    /** Injectable for tests so backoff does not sleep for real. */
    sleep?: (ms: number) => Promise<void>
    maxRetries?: number
    baseRetryDelayMs?: number
    maxRetryDelayMs?: number
}

const DEFAULT_MAX_RETRIES = 4
const DEFAULT_BASE_RETRY_DELAY_MS = 500
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000

/** A tiny FIFO semaphore that bounds concurrency to `max`. */
export class Semaphore {
    private active = 0
    private readonly waiters: Array<() => void> = []

    constructor(private readonly max: number) {}

    async acquire(): Promise<() => void> {
        await new Promise<void>(resolve => {
            if (this.active < this.max) {
                this.active += 1
                resolve()
            } else {
                this.waiters.push(() => {
                    this.active += 1
                    resolve()
                })
            }
        })

        let released = false
        return () => {
            if (released) return
            released = true
            this.active -= 1
            const next = this.waiters.shift()
            if (next) next()
        }
    }
}

function buildQuery(params: QueryParams): URLSearchParams {
    const sp = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue
        if (Array.isArray(value)) {
            if (value.length === 0) continue
            sp.set(key, value.join(','))
        } else {
            sp.set(key, String(value))
        }
    }
    return sp
}

type HttpMethod = 'GET' | 'POST'

interface FetchOptions {
    method: HttpMethod
    accept: string
}

export interface RequestOptions {
    method?: HttpMethod
    params?: QueryParams
}

/**
 * Framework-agnostic HTTP client for the Yandex Metrica API. Knows nothing
 * about MCP. Handles auth, concurrency, timeouts, and retry/backoff. Returns
 * parsed JSON (`request`/`requestJson`) or streams raw text lines
 * (`streamLines`, for the Logs API) so callers validate/parse shape themselves.
 */
export class MetricaClient {
    private readonly semaphore: Semaphore
    private readonly fetchImpl: typeof fetch
    private readonly sleep: (ms: number) => Promise<void>
    private readonly maxRetries: number
    private readonly baseRetryDelayMs: number
    private readonly maxRetryDelayMs: number

    constructor(private readonly options: MetricaClientOptions) {
        this.semaphore = new Semaphore(options.maxConcurrency)
        this.fetchImpl = options.fetchImpl ?? fetch
        this.sleep =
            options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
        this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
        this.baseRetryDelayMs =
            options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS
        this.maxRetryDelayMs =
            options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS
    }

    /** GET `path` with `params`, returning parsed JSON (caller validates shape). */
    async request(path: string, params: QueryParams = {}): Promise<unknown> {
        return this.requestJson(path, { params })
    }

    /**
     * Request `path` (GET or POST) returning parsed JSON. POST sends its params
     * as the query string with an empty body — the shape the Metrica management
     * endpoints (including Logs API create/clean/cancel) expect.
     */
    async requestJson(
        path: string,
        opts: RequestOptions = {},
    ): Promise<unknown> {
        const { status, text } = await this.send(
            path,
            this.withLang(opts.params ?? {}),
            { method: opts.method ?? 'GET', accept: 'application/json' },
        )
        return this.parseJson(status, text)
    }

    /**
     * Stream a raw text body (Logs API download) line by line, holding one
     * concurrency slot for the whole transfer. Yields lines WITHOUT their
     * trailing newline; the caller decides when to stop (a sample) or drain to a
     * file. Breaking out of the iterator aborts the transfer and frees the slot.
     * The inactivity timeout is re-armed on each chunk, so a long-but-flowing
     * download is not killed while a truly stalled one still is.
     */
    async *streamLines(
        path: string,
        params: QueryParams = {},
    ): AsyncGenerator<string> {
        const url = `${this.options.baseUrl}${path}?${buildQuery(params).toString()}`
        const release = await this.semaphore.acquire()
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        const arm = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(
                () => controller.abort(),
                this.options.requestTimeoutMs,
            )
        }
        try {
            const token = await this.options.getToken()
            arm()
            const res = await this.fetchImpl(url, {
                method: 'GET',
                headers: {
                    Authorization: `OAuth ${token}`,
                    'User-Agent': this.options.userAgent,
                    Accept: 'text/tab-separated-values, text/plain, */*',
                },
                signal: controller.signal,
            })
            if (!res.ok) {
                throw errorFromResponse(res.status, await res.text())
            }
            if (!res.body) {
                for (const line of (await res.text()).split('\n')) yield line
                return
            }
            const decoder = new TextDecoder()
            let buf = ''
            for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
                arm()
                buf += decoder.decode(chunk, { stream: true })
                let nl = buf.indexOf('\n')
                while (nl >= 0) {
                    yield buf.slice(0, nl)
                    buf = buf.slice(nl + 1)
                    nl = buf.indexOf('\n')
                }
            }
            buf += decoder.decode(new Uint8Array())
            if (buf.length > 0) yield buf
        } catch (err) {
            if (err instanceof MetricaApiError) throw err
            if (err instanceof Error && err.name === 'AbortError') {
                throw new MetricaApiError(
                    0,
                    `Log download timed out after ${this.options.requestTimeoutMs}ms of inactivity`,
                    ['timeout'],
                )
            }
            const detail = err instanceof Error ? err.message : String(err)
            throw new MetricaApiError(
                0,
                `Network error during log download: ${detail}`,
                ['network_error'],
            )
        } finally {
            if (timer) clearTimeout(timer)
            controller.abort()
            release()
        }
    }

    private withLang(params: QueryParams): QueryParams {
        if (params.lang === undefined && this.options.lang) {
            return { ...params, lang: this.options.lang }
        }
        return params
    }

    private parseJson(status: number, text: string): unknown {
        // An empty 2xx body (e.g. a 202 Accepted dedup on Logs API create) is
        // "no content", not malformed — surface it as null for callers to handle.
        if (text.trim() === '') return null
        try {
            return JSON.parse(text) as unknown
        } catch {
            throw new MetricaApiError(
                status,
                'Metrica API returned a non-JSON response',
            )
        }
    }

    private async send(
        path: string,
        params: QueryParams,
        opts: FetchOptions,
    ): Promise<{ status: number; text: string }> {
        const url = `${this.options.baseUrl}${path}?${buildQuery(params).toString()}`
        const release = await this.semaphore.acquire()
        try {
            return await this.withRetry(url, opts)
        } finally {
            release()
        }
    }

    private async withRetry(
        url: string,
        opts: FetchOptions,
    ): Promise<{ status: number; text: string }> {
        let attempt = 0
        let authRetried = false
        // Records the token doFetch actually sent, so a reactive refresh can
        // tell the provider which token was rejected.
        const sent = { token: '' }
        for (;;) {
            try {
                return await this.doFetch(url, sent, opts)
            } catch (err) {
                // Reactive auth refresh: on a 401/invalid_token, refresh once
                // and retry immediately before falling back to normal backoff.
                // Skip when no provider can yield a different token (e.g. a
                // static token) — the retry would be guaranteed to fail.
                const canRefresh = this.options.canRefresh?.() ?? true
                if (
                    !authRetried &&
                    canRefresh &&
                    this.options.onUnauthorized &&
                    err instanceof MetricaApiError &&
                    (err.status === 401 ||
                        err.errorTypes.includes('invalid_token'))
                ) {
                    authRetried = true
                    try {
                        await this.options.onUnauthorized(sent.token)
                    } catch {
                        // A refresh failure must not mask the original 401 —
                        // surface the API error the caller actually got.
                        throw err
                    }
                    continue
                }
                const retryable =
                    err instanceof MetricaApiError ? err.isRetryable : true
                if (!retryable || attempt >= this.maxRetries) throw err
                await this.sleep(this.backoffDelay(attempt))
                attempt += 1
            }
        }
    }

    private backoffDelay(attempt: number): number {
        const exp = this.baseRetryDelayMs * 2 ** attempt
        const jitter = exp * 0.25 * Math.random()
        return Math.min(exp + jitter, this.maxRetryDelayMs)
    }

    private async doFetch(
        url: string,
        sent: { token: string },
        opts: FetchOptions,
    ): Promise<{ status: number; text: string }> {
        const token = await this.options.getToken()
        sent.token = token
        const controller = new AbortController()
        const timer = setTimeout(
            () => controller.abort(),
            this.options.requestTimeoutMs,
        )

        let res: Response
        let text: string
        try {
            res = await this.fetchImpl(url, {
                method: opts.method,
                headers: {
                    Authorization: `OAuth ${token}`,
                    'User-Agent': this.options.userAgent,
                    Accept: opts.accept,
                },
                signal: controller.signal,
            })
            // Read the body inside the timer scope so a stalled body is aborted too.
            text = await res.text()
        } catch (err) {
            // Map transport-level failures to a MetricaApiError (status 0) so the
            // retry layer and the MCP error formatter can branch on them instead
            // of seeing an opaque, unactionable raw error.
            if (err instanceof MetricaApiError) throw err
            if (err instanceof Error && err.name === 'AbortError') {
                throw new MetricaApiError(
                    0,
                    `Request to Metrica API timed out after ${this.options.requestTimeoutMs}ms`,
                    ['timeout'],
                )
            }
            const detail = err instanceof Error ? err.message : String(err)
            throw new MetricaApiError(
                0,
                `Network error reaching the Metrica API: ${detail}`,
                ['network_error'],
            )
        } finally {
            clearTimeout(timer)
        }

        if (!res.ok) {
            throw errorFromResponse(res.status, text)
        }
        return { status: res.status, text }
    }
}
