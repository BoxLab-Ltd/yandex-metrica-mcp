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
        permission: z.string().optional(),
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

/** Single-counter wrapper for GET .../counter/{id}. */
export const CounterResponseSchema = z.object({ counter: CounterSchema })

/** Management API: a saved API segment (lives under the /apisegment/ path). */
export const SegmentSchema = z
    .object({
        segment_id: z.number(),
        name: z.string().optional(),
        expression: z.string().optional(),
        status: z.string().optional(),
        segment_source: z.string().optional(),
    })
    .catchall(z.unknown())
export type Segment = z.infer<typeof SegmentSchema>
export const SegmentsResponseSchema = z.object({
    segments: z.array(SegmentSchema).default([]),
})

/** Management API: a traffic filter (excludes robots, internal IPs, etc.). */
export const FilterSchema = z
    .object({
        id: z.number(),
        attr: z.string().optional(),
        type: z.string().optional(),
        value: z.string().optional(),
        action: z.string().optional(),
        status: z.string().optional(),
        with_subdomains: FlexibleBool.optional(),
    })
    .catchall(z.unknown())
export type Filter = z.infer<typeof FilterSchema>
export const FiltersResponseSchema = z.object({
    filters: z.array(FilterSchema).default([]),
})

/** Management API: a URL-normalization operation applied at collection time. */
export const OperationSchema = z
    .object({
        id: z.number(),
        action: z.string().optional(),
        attr: z.string().optional(),
        value: z.string().optional(),
        status: z.string().optional(),
    })
    .catchall(z.unknown())
export type Operation = z.infer<typeof OperationSchema>
export const OperationsResponseSchema = z.object({
    operations: z.array(OperationSchema).default([]),
})

/** Management API: a per-counter access grant. */
export const GrantSchema = z
    .object({
        user_login: z.string().optional(),
        perm: z.string().optional(),
        created_at: z.string().optional(),
        comment: z.string().optional(),
    })
    .catchall(z.unknown())
export type Grant = z.infer<typeof GrantSchema>
export const GrantsResponseSchema = z.object({
    grants: z.array(GrantSchema).default([]),
})

/**
 * Logs API request lifecycle statuses. Kept as a plain string in the schema
 * (lenient, tolerates drift); these constants drive the ready/terminal logic.
 */
export const LOG_STATUS_PROCESSED = 'processed'
export const LOG_IN_PROGRESS_STATUSES = ['created', 'awaiting_retry'] as const
export const LOG_TERMINAL_STATUSES = [
    'processing_failed',
    'canceled',
    'cleaned_by_user',
    'cleaned_automatically_as_too_old',
] as const

/** One downloadable portion of a prepared log. */
export const LogPartSchema = z
    .object({
        part_number: z.number(),
        size: z.number().optional(),
    })
    .catchall(z.unknown())
export type LogPart = z.infer<typeof LogPartSchema>

/** A Logs API request object (returned by create/get/list/clean/cancel). */
export const LogRequestSchema = z
    .object({
        request_id: z.number(),
        counter_id: z.number().optional(),
        source: z.string().optional(),
        date1: z.string().optional(),
        date2: z.string().optional(),
        fields: z.array(z.string()).optional(),
        status: z.string(),
        size: z.number().optional(),
        parts: z.array(LogPartSchema).optional(),
        attribution: z.string().optional(),
    })
    .catchall(z.unknown())
export type LogRequest = z.infer<typeof LogRequestSchema>

export const LogRequestWrapperSchema = z.object({
    log_request: LogRequestSchema,
})

export const LogRequestsListSchema = z.object({
    requests: z.array(LogRequestSchema).default([]),
})

/** Result of the `evaluate` feasibility check. */
export const LogRequestEvaluationSchema = z
    .object({
        possible: z.boolean(),
        max_possible_day_quantity: z.number().optional(),
    })
    .catchall(z.unknown())
export type LogRequestEvaluation = z.infer<typeof LogRequestEvaluationSchema>

export const LogRequestEvaluationWrapperSchema = z.object({
    log_request_evaluation: LogRequestEvaluationSchema,
})
