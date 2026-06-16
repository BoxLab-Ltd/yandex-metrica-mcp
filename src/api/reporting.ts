import type { MetricaClient } from './client.js'
import {
    BytimeResponseSchema,
    ComparisonResponseSchema,
    DataResponseSchema,
    DrilldownResponseSchema,
    type BytimeResponse,
    type ComparisonResponse,
    type DataResponse,
    type DrilldownResponse,
} from './schemas.js'

const toIds = (ids: number | number[]): number[] =>
    Array.isArray(ids) ? ids : [ids]

/** Shared inputs for a table-style report. */
export interface ReportParams {
    ids: number | number[]
    metrics: string[]
    dimensions?: string[]
    date1?: string
    date2?: string
    filters?: string
    sort?: string[]
    limit?: number
    offset?: number
    accuracy?: string
    preset?: string
    timezone?: string
    lang?: string
    includeUndefined?: boolean
}

/** `GET /stat/v1/data` — table report. */
export async function runReport(
    client: MetricaClient,
    p: ReportParams,
): Promise<DataResponse> {
    const raw = await client.request('/stat/v1/data', {
        ids: toIds(p.ids),
        metrics: p.metrics,
        dimensions: p.dimensions,
        date1: p.date1,
        date2: p.date2,
        filters: p.filters,
        sort: p.sort,
        limit: p.limit,
        offset: p.offset,
        accuracy: p.accuracy,
        preset: p.preset,
        timezone: p.timezone,
        lang: p.lang,
        include_undefined: p.includeUndefined,
    })
    return DataResponseSchema.parse(raw)
}

/** Inputs for a two-segment comparison (dates/filters split per segment). */
export interface ComparisonParams {
    ids: number | number[]
    metrics: string[]
    dimensions?: string[]
    date1A?: string
    date2A?: string
    filtersA?: string
    date1B?: string
    date2B?: string
    filtersB?: string
    sort?: string[]
    limit?: number
    offset?: number
    accuracy?: string
    preset?: string
    timezone?: string
    lang?: string
    includeUndefined?: boolean
}

/** `GET /stat/v1/data/comparison` — per-row metrics become `{ a, b }`. */
export async function runComparison(
    client: MetricaClient,
    p: ComparisonParams,
): Promise<ComparisonResponse> {
    const raw = await client.request('/stat/v1/data/comparison', {
        ids: toIds(p.ids),
        metrics: p.metrics,
        dimensions: p.dimensions,
        date1_a: p.date1A,
        date2_a: p.date2A,
        filters_a: p.filtersA,
        date1_b: p.date1B,
        date2_b: p.date2B,
        filters_b: p.filtersB,
        sort: p.sort,
        limit: p.limit,
        offset: p.offset,
        accuracy: p.accuracy,
        preset: p.preset,
        timezone: p.timezone,
        lang: p.lang,
        include_undefined: p.includeUndefined,
    })
    return ComparisonResponseSchema.parse(raw)
}

/** Inputs for one level of a tree report. */
export interface DrilldownParams extends ReportParams {
    /** Path from the root as a list of dimension keys; omit for the top level. */
    parentId?: string[]
}

/** `GET /stat/v1/data/drilldown` — singular `dimension` + per-row `expand`. */
export async function runDrilldown(
    client: MetricaClient,
    p: DrilldownParams,
): Promise<DrilldownResponse> {
    const raw = await client.request('/stat/v1/data/drilldown', {
        ids: toIds(p.ids),
        metrics: p.metrics,
        dimensions: p.dimensions,
        date1: p.date1,
        date2: p.date2,
        filters: p.filters,
        sort: p.sort,
        limit: p.limit,
        offset: p.offset,
        accuracy: p.accuracy,
        preset: p.preset,
        timezone: p.timezone,
        lang: p.lang,
        include_undefined: p.includeUndefined,
        parent_id: p.parentId ? JSON.stringify(p.parentId) : undefined,
    })
    return DrilldownResponseSchema.parse(raw)
}

/** Inputs for a time-series report. */
export interface BytimeParams {
    ids: number | number[]
    metrics: string[]
    dimensions?: string[]
    date1?: string
    date2?: string
    /** Interval granularity: all, auto, hour, day, week, month, quarter, year, … */
    group?: string
    filters?: string
    accuracy?: string
    timezone?: string
    lang?: string
    /** Max number of dimension rows charted (max 30). */
    topKeys?: number
    includeUndefined?: boolean
}

/** `GET /stat/v1/data/bytime` — metrics split into a series over time intervals. */
export async function runBytime(
    client: MetricaClient,
    p: BytimeParams,
): Promise<BytimeResponse> {
    const raw = await client.request('/stat/v1/data/bytime', {
        ids: toIds(p.ids),
        metrics: p.metrics,
        dimensions: p.dimensions,
        date1: p.date1,
        date2: p.date2,
        group: p.group,
        filters: p.filters,
        accuracy: p.accuracy,
        timezone: p.timezone,
        lang: p.lang,
        top_keys: p.topKeys,
        include_undefined: p.includeUndefined,
    })
    return BytimeResponseSchema.parse(raw)
}
