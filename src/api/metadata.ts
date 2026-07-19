import type { MetricaClient } from './client.js'
import {
    CounterResponseSchema,
    CountersResponseSchema,
    FiltersResponseSchema,
    GoalsResponseSchema,
    GrantsResponseSchema,
    OperationsResponseSchema,
    SegmentsResponseSchema,
    type Counter,
    type Filter,
    type Goal,
    type Grant,
    type Operation,
    type Segment,
} from './schemas.js'

/**
 * Read wrappers over the Yandex Metrica Management API
 * (`/management/v1/...`). All are GET-only and need just the `metrika:read`
 * scope — no counter/goal/settings mutation lives here.
 */

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

/** Get a single counter's settings. */
export async function getCounter(
    client: MetricaClient,
    counterId: number,
): Promise<Counter> {
    const raw = await client.request(
        `/management/v1/counter/${counterId}`,
        {},
    )
    return CounterResponseSchema.parse(raw).counter
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

/** List the saved API segments on a counter (note the /apisegment/ path). */
export async function listSegments(
    client: MetricaClient,
    counterId: number,
): Promise<Segment[]> {
    const raw = await client.request(
        `/management/v1/counter/${counterId}/apisegment/segments`,
        {},
    )
    return SegmentsResponseSchema.parse(raw).segments
}

/** List the traffic filters on a counter. */
export async function listFilters(
    client: MetricaClient,
    counterId: number,
): Promise<Filter[]> {
    const raw = await client.request(
        `/management/v1/counter/${counterId}/filters`,
        {},
    )
    return FiltersResponseSchema.parse(raw).filters
}

/** List the URL-normalization operations on a counter. */
export async function listOperations(
    client: MetricaClient,
    counterId: number,
): Promise<Operation[]> {
    const raw = await client.request(
        `/management/v1/counter/${counterId}/operations`,
        {},
    )
    return OperationsResponseSchema.parse(raw).operations
}

/** List the per-counter access grants (who can see/edit the counter). */
export async function listGrants(
    client: MetricaClient,
    counterId: number,
): Promise<Grant[]> {
    const raw = await client.request(
        `/management/v1/counter/${counterId}/grants`,
        {},
    )
    return GrantsResponseSchema.parse(raw).grants
}
