import type { MetricaClient } from './client.js'
import {
    CountersResponseSchema,
    GoalsResponseSchema,
    type Counter,
    type Goal,
} from './schemas.js'

/**
 * List counters available to the token (lightweight — no nested goals; fetch
 * those per counter with {@link listGoals} to keep responses small).
 */
export async function listCounters(client: MetricaClient): Promise<Counter[]> {
    const raw = await client.request('/management/v1/counters', {
        per_page: 1000,
    })
    return CountersResponseSchema.parse(raw).counters
}

/** List the goals configured on a counter. */
export async function listGoals(
    client: MetricaClient,
    counterId: number,
): Promise<Goal[]> {
    const raw = await client.request(
        `/management/v1/counter/${counterId}/goals`,
        {},
    )
    return GoalsResponseSchema.parse(raw).goals
}
