import type { YandexClient } from '@boxlab/yandex-mcp-core'
import type { Config } from '../config.js'

/** Everything a tool handler needs: the API client and config. */
export interface ToolContext {
    client: YandexClient
    config: Config
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
