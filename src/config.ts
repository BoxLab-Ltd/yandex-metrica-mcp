import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    cleanEnv,
    loadYandexAuthConfig,
    type YandexAuthConfig,
} from '@boxlab/yandex-mcp-core'
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

/** OAuth scope this server requests (read-only Metrica access). */
const SCOPE = 'metrika:read'

/**
 * Resolved, validated domain configuration for the server. Auth lives in a
 * separate {@link YandexAuthConfig} (see {@link loadAuthConfig}); everything
 * here is sourced from environment variables so the server stays stateless.
 */
export interface Config {
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
 * Load and validate domain configuration from the given environment (defaults
 * to `process.env`). Throws a single, human-readable error listing every
 * problem. Auth is loaded separately via {@link loadAuthConfig}.
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
    return {
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

/**
 * Load this server's Yandex auth configuration: the `metrika:read` scope, the
 * embedded public client (or a user's own app via `YANDEX_OAUTH_CLIENT_ID`),
 * and the static-token env `YANDEX_METRIKA_TOKEN` (+ its `_FILE` override).
 */
export function loadAuthConfig(
    env: NodeJS.ProcessEnv = process.env,
): YandexAuthConfig {
    return loadYandexAuthConfig(env, {
        scope: SCOPE,
        appName: SERVER_NAME,
        embeddedClientId: EMBEDDED_OAUTH_CLIENT_ID,
        staticTokenEnv: 'YANDEX_METRIKA_TOKEN',
    })
}
