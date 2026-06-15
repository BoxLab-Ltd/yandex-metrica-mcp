import { createRequire } from 'node:module'
import { z } from 'zod'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { name: string; version: string }

export const SERVER_NAME = pkg.name
export const SERVER_VERSION = pkg.version

/**
 * Resolved, validated runtime configuration for the server.
 *
 * Everything is sourced from environment variables so the server stays
 * stateless and secret-free on disk. See `.env.example` for the contract.
 */
export interface Config {
    /** Static Yandex Metrica OAuth token (alternative to the `auth` login). */
    readonly token?: string
    /** Yandex OAuth app client id — enables the `auth` flow and token refresh. */
    readonly oauthClientId?: string
    /** Yandex OAuth app client secret. */
    readonly oauthClientSecret?: string
    /** Yandex ID OAuth base URL. */
    readonly oauthBaseUrl: string
    /** Optional default counter id used when a tool call omits `counterId`. */
    readonly defaultCounterId?: number
    /** API base URL (overridable only for tests/mocks). */
    readonly baseUrl: string
    /** Language for human-readable labels in responses. */
    readonly lang: string
    /** Max concurrent in-flight requests to the Metrica API (token-bucket). */
    readonly maxConcurrency: number
    /** Per-request timeout in milliseconds. */
    readonly requestTimeoutMs: number
    /** Default row limit applied to report tools when the caller omits one. */
    readonly defaultRowLimit: number
    /** Value sent in the `User-Agent` header. */
    readonly userAgent: string
}

const EnvSchema = z.object({
    YANDEX_METRIKA_TOKEN: z.string().min(1).optional(),
    YANDEX_OAUTH_CLIENT_ID: z.string().min(1).optional(),
    YANDEX_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
    YANDEX_OAUTH_BASE_URL: z.url().default('https://oauth.yandex.com'),
    YANDEX_METRIKA_COUNTER_ID: z.coerce.number().int().positive().optional(),
    YANDEX_METRIKA_LANG: z.string().min(2).max(5).default('en'),
    YANDEX_METRIKA_BASE_URL: z.url().default('https://api-metrika.yandex.net'),
})

/** Internal, non-env-tunable defaults that callers rarely need to change. */
const MAX_CONCURRENCY = 3
const REQUEST_TIMEOUT_MS = 60_000
const DEFAULT_ROW_LIMIT = 100

/**
 * Load and validate configuration from the given environment (defaults to
 * `process.env`). Throws a single, human-readable error listing every problem.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const parsed = EnvSchema.safeParse(env)
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map(i => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n')
        throw new Error(`Invalid Yandex Metrica MCP configuration:\n${issues}`)
    }

    const e = parsed.data
    return {
        token: e.YANDEX_METRIKA_TOKEN,
        oauthClientId: e.YANDEX_OAUTH_CLIENT_ID,
        oauthClientSecret: e.YANDEX_OAUTH_CLIENT_SECRET,
        oauthBaseUrl: e.YANDEX_OAUTH_BASE_URL,
        defaultCounterId: e.YANDEX_METRIKA_COUNTER_ID,
        baseUrl: e.YANDEX_METRIKA_BASE_URL.replace(/\/+$/, ''),
        lang: e.YANDEX_METRIKA_LANG,
        maxConcurrency: MAX_CONCURRENCY,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        defaultRowLimit: DEFAULT_ROW_LIMIT,
        userAgent: `${SERVER_NAME}/${SERVER_VERSION}`,
    }
}
