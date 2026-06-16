import { z } from 'zod'

/**
 * Reusable zod input fields for the report tools. Descriptions matter: they are
 * the model's primary guidance, so they are explicit about formats and limits.
 */

const counterId = z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
        'Yandex Metrica counter id. Optional if YANDEX_METRIKA_COUNTER_ID is configured.',
    )

const metrics = z
    .array(z.string())
    .min(1)
    .max(20)
    .describe(
        'Metric ids, e.g. ["ym:s:visits","ym:s:users"]. Max 20. Discover valid ids with get_metadata. ' +
            'Do not mix ym:s: (visits) and ym:pv: (hits) namespaces in one call.',
    )

const dimensions = z
    .array(z.string())
    .max(10)
    .optional()
    .describe(
        'Dimension ids to group by, e.g. ["ym:s:lastsignTrafficSource"]. Max 10. ' +
            'Do not mix ym:s: and ym:pv: namespaces.',
    )

const filters = z
    .string()
    .optional()
    .describe(
        "Metrica filter expression in native syntax, e.g. ym:s:regionCityName=='Moscow' AND ym:pv:URL=@'help'.",
    )

const sort = z
    .array(z.string())
    .optional()
    .describe(
        'Sort fields; prefix a field with "-" for descending, e.g. ["-ym:s:visits"].',
    )

const limit = z
    .number()
    .int()
    .positive()
    .max(100000)
    .optional()
    .describe(
        'Rows per page (max 100000). Defaults to a small value to protect context.',
    )

const offset = z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
        '1-based index of the first row to return, for pagination. Default 1.',
    )

const accuracy = z
    .string()
    .refine(
        v =>
            ['low', 'medium', 'high', 'full'].includes(v) ||
            (/^\d*\.?\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 1),
        {
            message:
                'accuracy must be one of low|medium|high|full, or a number between 0 and 1',
        },
    )
    .optional()
    .describe(
        'Sampling accuracy: low | medium | high | full, or a 0..1 share. Use "full" for exact data.',
    )

const timezone = z
    .string()
    .optional()
    .describe(
        'Timezone offset for the report as ±hh:mm, e.g. "+03:00". Defaults to the counter timezone.',
    )

const preset = z
    .string()
    .optional()
    .describe(
        'Named Metrica report preset (advanced); can substitute for metrics/dimensions.',
    )

const includeUndefined = z
    .boolean()
    .optional()
    .describe(
        'Include rows where the first dimension value is undefined ("Not set"). Default false.',
    )

const fullResponse = z
    .boolean()
    .optional()
    .describe(
        'If true, include all dimension sub-fields (id, icons, …). Default false: only the dimension name ' +
            'and metric values are returned, to save context.',
    )

const date = (which: string) =>
    z
        .string()
        .optional()
        .describe(
            `${which} as YYYY-MM-DD or relative (today, yesterday, NdaysAgo).`,
        )

/** Input shape for run_report. */
export const reportInputShape = {
    counterId,
    metrics,
    dimensions,
    date1: date('Start date'),
    date2: date('End date'),
    filters,
    sort,
    limit,
    offset,
    accuracy,
    timezone,
    preset,
    includeUndefined,
    fullResponse,
}

/** Input shape for run_drilldown (report + parentId). */
export const drilldownInputShape = {
    ...reportInputShape,
    parentId: z
        .array(z.string())
        .optional()
        .describe(
            'Path from the tree root as a list of dimension keys. Omit for the top level.',
        ),
}

/** Input shape for run_comparison (dates/filters split into A and B segments). */
export const comparisonInputShape = {
    counterId,
    metrics,
    dimensions,
    date1A: date('Segment A start date'),
    date2A: date('Segment A end date'),
    filtersA: z
        .string()
        .optional()
        .describe('Filter expression for segment A.'),
    date1B: date('Segment B start date'),
    date2B: date('Segment B end date'),
    filtersB: z
        .string()
        .optional()
        .describe('Filter expression for segment B.'),
    sort,
    limit,
    offset,
    accuracy,
    timezone,
    preset,
    includeUndefined,
    fullResponse,
}

/** Valid `group` granularities for the time-series endpoint. */
export const TIMESERIES_GROUPS = [
    'all',
    'auto',
    'hour',
    'day',
    'week',
    'month',
    'quarter',
    'year',
] as const

/** Input shape for run_timeseries (/bytime). */
export const timeseriesInputShape = {
    counterId,
    metrics,
    dimensions,
    date1: date('Start date'),
    date2: date('End date'),
    group: z
        .enum(TIMESERIES_GROUPS)
        .optional()
        .describe('Time interval granularity. Default day.'),
    filters,
    accuracy,
    timezone,
    includeUndefined,
    topKeys: z
        .number()
        .int()
        .positive()
        .max(30)
        .optional()
        .describe('Max number of dimension rows to chart (max 30). Default 7.'),
    fullResponse,
}

/** Sensible default date window: the last 7 full days (ending yesterday). */
export const DEFAULT_DATE1 = '7daysAgo'
export const DEFAULT_DATE2 = 'yesterday'
