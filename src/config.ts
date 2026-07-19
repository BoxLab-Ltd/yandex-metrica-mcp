import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { name: string; version: string }

export const SERVER_NAME = pkg.name
export const SERVER_VERSION = pkg.version

/**
 * Built-in public OAuth client for the `auth` flow, so users don't have to
 * register their own Yandex app. It is a PUBLIC client: only the client_id ships
 * (no secret). PKCE authenticates the exchange; the ~1-year token means refresh
 * (which would need a secret) isn't required. Override with YANDEX_OAUTH_CLIENT_ID
 * to use your own app (set YANDEX_OAUTH_CLIENT_SECRET too to enable refresh).
 */
export const EMBEDDED_OAUTH_CLIENT_ID = '6f14d1c1384440b1b2915f6d956da84b'

/**
 * Resolved, validated runtime configuration for the server.
 *
 * Everything is sourced from environment variables so the server stays
 * stateless and secret-free on disk. See `.env.example` for the contract.
 */
export interface Config {
    /** Static Yandex Metrica OAuth token (alternative to the `auth` login). */
    readonly token?: string
    /** OAuth client id used by `auth` — the embedded public client, or an override. */
    readonly oauthClientId: string
    /** True when using the user's own app (env override) rather than the embedded one. */
    readonly oauthIsCustomApp: boolean
    /** OAuth client secret (only for a user's own app; enables token refresh). */
    readonly oauthClientSecret?: string
    /** Yandex ID OAuth base URL. */
    readonly oauthBaseUrl: string
    /** Fixed loopback port for the `auth` redirect (must match the app's registered URI). */
    readonly oauthLoopbackPort: number
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
    /** Directory where `logs_download` writes full exports in file mode. */
    readonly logsOutputDir: string
    /** Value sent in the `User-Agent` header. */
    readonly userAgent: string
}

const EnvSchema = z.object({
    YANDEX_METRIKA_TOKEN: z.string().min(1).optional(),
    YANDEX_OAUTH_CLIENT_ID: z.string().min(1).optional(),
    YANDEX_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
    YANDEX_OAUTH_BASE_URL: z.url().default('https://oauth.yandex.com'),
    YANDEX_OAUTH_LOOPBACK_PORT: z.coerce
        .number()
        .int()
        .min(1024)
        .max(65535)
        .default(53682),
    YANDEX_METRIKA_COUNTER_ID: z.coerce.number().int().positive().optional(),
    YANDEX_METRIKA_LANG: z.string().min(2).max(5).default('en'),
    YANDEX_METRIKA_BASE_URL: z.url().default('https://api-metrika.yandex.net'),
    YANDEX_METRIKA_LOGS_DIR: z.string().min(1).optional(),
})

/** Internal, non-env-tunable defaults that callers rarely need to change. */
const MAX_CONCURRENCY = 3
const REQUEST_TIMEOUT_MS = 60_000
const DEFAULT_ROW_LIMIT = 100

/**
 * Drop empty and unexpanded-`${...}` values so an optional, unset variable reads
 * as absent. A Desktop Extension (.mcpb) substitutes an untouched optional
 * user_config into the env as `""`, which would otherwise fail `min(1)`/positive
 * validation and stop the server from starting.
 */
function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const out: NodeJS.ProcessEnv = {}
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) continue
        const trimmed = value.trim()
        if (trimmed === '' || /^\$\{[^}]*\}$/.test(trimmed)) continue
        out[key] = value
    }
    return out
}

/**
 * Load and validate configuration from the given environment (defaults to
 * `process.env`). Throws a single, human-readable error listing every problem.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const parsed = EnvSchema.safeParse(cleanEnv(env))
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map(i => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n')
        throw new Error(`Invalid Yandex Metrica MCP configuration:\n${issues}`)
    }

    const e = parsed.data
    const isCustomApp = e.YANDEX_OAUTH_CLIENT_ID !== undefined
    return {
        token: e.YANDEX_METRIKA_TOKEN,
        oauthClientId: e.YANDEX_OAUTH_CLIENT_ID ?? EMBEDDED_OAUTH_CLIENT_ID,
        oauthIsCustomApp: isCustomApp,
        oauthClientSecret: e.YANDEX_OAUTH_CLIENT_SECRET,
        oauthBaseUrl: e.YANDEX_OAUTH_BASE_URL,
        oauthLoopbackPort: e.YANDEX_OAUTH_LOOPBACK_PORT,
        defaultCounterId: e.YANDEX_METRIKA_COUNTER_ID,
        baseUrl: e.YANDEX_METRIKA_BASE_URL.replace(/\/+$/, ''),
        lang: e.YANDEX_METRIKA_LANG,
        maxConcurrency: MAX_CONCURRENCY,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        defaultRowLimit: DEFAULT_ROW_LIMIT,
        logsOutputDir:
            e.YANDEX_METRIKA_LOGS_DIR ??
            join(tmpdir(), 'yandex-metrica-mcp-logs'),
        userAgent: `${SERVER_NAME}/${SERVER_VERSION}`,
    }
}
