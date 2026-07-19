import type { Config } from '../config.js'
import type { MetricaClient } from '../api/client.js'
import type { TokenSet } from '../auth/oauth.js'

/** Everything a tool handler needs: the API client, config, and login sink. */
export interface ToolContext {
    client: MetricaClient
    config: Config
    /** Persist and adopt a token set obtained by the `login`/`submit_code` tools. */
    onLogin(tokens: TokenSet): void
}

/**
 * Resolve the counter id from a tool argument, falling back to the configured
 * default. Throws a clear, actionable error when neither is available.
 */
export function resolveCounterId(
    counterId: number | undefined,
    config: Config,
): number {
    const resolved = counterId ?? config.defaultCounterId
    if (resolved === undefined) {
        throw new Error(
            'No counter id provided. Pass `counterId`, or set YANDEX_METRIKA_COUNTER_ID to use a default. ' +
                'Call `get_metadata` to list the counters available to your token.',
        )
    }
    return resolved
}
