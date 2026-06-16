import { z } from 'zod'

/**
 * Zod schemas for Yandex Metrica API responses. They are intentionally lenient
 * (`.catchall`, optional meta) so that API drift adds fields without breaking
 * parsing. See docs/API-NOTES.md for the verified contract.
 */

/**
 * A boolean that the Metrica API may return as a number (0/1) — observed for
 * goal `is_favorite` and counter `favorite`. Normalizes to a real boolean.
 */
const FlexibleBool = z
    .union([z.boolean(), z.number()])
    .transform(v => Boolean(v))

/** A single dimension cell. Only `name` is guaranteed; `id` is the usual extra. */
export const DimensionObjectSchema = z
    .object({
        name: z.string().nullable(),
        id: z.string().nullable().optional(),
    })
    .catchall(z.unknown())
export type DimensionObject = z.infer<typeof DimensionObjectSchema>

/** Positional metric values; may contain `null` (e.g. divide-by-zero). */
export const MetricsFlatSchema = z.array(z.number().nullable())

/** Meta fields shared by every Reporting endpoint (all snake_case). */
const metaShape = {
    query: z.record(z.string(), z.unknown()).optional(),
    total_rows: z.number().optional(),
    total_rows_rounded: z.boolean().optional(),
    sampled: z.boolean().optional(),
    contains_sensitive_data: z.boolean().optional(),
    sample_share: z.number().optional(),
    sample_size: z.number().optional(),
    sample_space: z.number().optional(),
    data_lag: z.number().optional(),
}

/** `/stat/v1/data` — table report. */
export const DataResponseSchema = z.object({
    ...metaShape,
    data: z.array(
        z.object({
            dimensions: z.array(DimensionObjectSchema),
            metrics: MetricsFlatSchema,
        }),
    ),
    totals: MetricsFlatSchema.optional(),
    min: MetricsFlatSchema.optional(),
    max: MetricsFlatSchema.optional(),
})
export type DataResponse = z.infer<typeof DataResponseSchema>

/** `/stat/v1/data/comparison` — metrics become `{ a, b }` per segment. */
const ComparisonMetricsSchema = z.object({
    a: MetricsFlatSchema,
    b: MetricsFlatSchema,
})
export const ComparisonResponseSchema = z.object({
    ...metaShape,
    data: z.array(
        z.object({
            dimensions: z.array(DimensionObjectSchema),
            metrics: ComparisonMetricsSchema,
        }),
    ),
    totals: ComparisonMetricsSchema.optional(),
})
export type ComparisonResponse = z.infer<typeof ComparisonResponseSchema>

/** `/stat/v1/data/bytime` — metrics are `number[][]` (metric → interval). */
const MetricsTimeSeriesSchema = z.array(MetricsFlatSchema)
export const BytimeResponseSchema = z.object({
    ...metaShape,
    data: z.array(
        z.object({
            dimensions: z.array(DimensionObjectSchema),
            metrics: MetricsTimeSeriesSchema,
        }),
    ),
    totals: MetricsTimeSeriesSchema.optional(),
    annotations: z
        .array(z.array(z.object({}).catchall(z.unknown())))
        .optional(),
})
export type BytimeResponse = z.infer<typeof BytimeResponseSchema>

/** `/stat/v1/data/drilldown` — singular `dimension` + per-row `expand`. */
export const DrilldownResponseSchema = z.object({
    ...metaShape,
    data: z.array(
        z.object({
            dimension: DimensionObjectSchema,
            metrics: MetricsFlatSchema,
            expand: z.boolean().optional(),
        }),
    ),
    totals: MetricsFlatSchema.optional(),
    min: MetricsFlatSchema.optional(),
    max: MetricsFlatSchema.optional(),
})
export type DrilldownResponse = z.infer<typeof DrilldownResponseSchema>

/** Management API: a counter (only the fields we surface; rest passthrough). */
export const CounterSchema = z
    .object({
        id: z.number(),
        name: z.string().optional(),
        status: z.string().optional(),
        owner_login: z.string().optional(),
        site2: z
            .object({ site: z.string().optional() })
            .catchall(z.unknown())
            .optional(),
        site: z.string().optional(),
        favorite: FlexibleBool.optional(),
        goals: z.array(z.unknown()).optional(),
    })
    .catchall(z.unknown())
export type Counter = z.infer<typeof CounterSchema>

export const CountersResponseSchema = z.object({
    rows: z.number().optional(),
    counters: z.array(CounterSchema),
})

/** Management API: a goal. */
export const GoalSchema = z
    .object({
        id: z.number(),
        name: z.string().optional(),
        type: z.string().optional(),
        is_favorite: FlexibleBool.optional(),
        default_price: z.number().optional(),
    })
    .catchall(z.unknown())
export type Goal = z.infer<typeof GoalSchema>

export const GoalsResponseSchema = z.object({
    goals: z.array(GoalSchema),
})
