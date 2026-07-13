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

/* ---- Logs API inputs ---------------------------------------------------- */

const logsSource = z
    .enum(['visits', 'hits'])
    .describe(
        'Raw data source. "visits" = sessions (ym:s: fields); "hits" = page views/events (ym:pv: fields). ' +
            'Fields must match the source.',
    )

const logsFields = z
    .array(z.string())
    .min(1)
    .describe(
        'Log field ids to export, e.g. ["ym:s:visitID","ym:s:dateTime","ym:s:startURL"]. All must share the ' +
            "source's prefix (ym:s: for visits, ym:pv: for hits). Discover valid ids with get_metadata (logs_fields).",
    )

const logsDate = (which: string) =>
    z
        .string()
        .describe(
            `${which} as a concrete YYYY-MM-DD (relative dates are not supported for logs). ` +
                "date2 must be earlier than today — the current day's data is not ready.",
        )

const requestId = z
    .number()
    .int()
    .positive()
    .describe('Log request id returned by logs_request.')

const logsAttribution = z
    .string()
    .optional()
    .describe(
        'Attribution model for attribution-dependent fields: FIRST | LAST | LASTSIGN | ' +
            'CROSS_DEVICE_LAST_SIGNIFICANT | AUTOMATIC | ... Default LASTSIGN.',
    )

const waitSeconds = z
    .number()
    .int()
    .min(0)
    .max(55)
    .optional()
    .describe(
        'Optionally poll up to this many seconds for preparation to finish before returning (handy for small ' +
            'exports). Default 0 = return immediately; poll with logs_status afterwards.',
    )

const downloadMode = z
    .enum(['sample', 'file'])
    .optional()
    .describe(
        'sample (default): return up to maxRows parsed rows inline — cheap, bounded, no file. ' +
            'file: stream the FULL export to a file and return its path plus a small preview.',
    )

const maxRows = z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe(
        'sample mode only: max rows to return inline (default 100, max 1000).',
    )

const outputPath = z
    .string()
    .optional()
    .describe(
        'file mode only: absolute path to write the export to. Defaults to a file in the configured logs directory.',
    )

export const LOGS_SAMPLE_DEFAULT_ROWS = 100
export const LOGS_PREVIEW_ROWS = 20

/** Input shape for logs_request (evaluate + create). */
export const logsRequestInputShape = {
    counterId,
    source: logsSource,
    fields: logsFields,
    date1: logsDate('Start date'),
    date2: logsDate('End date'),
    attribution: logsAttribution,
    waitSeconds,
}

/** Input shape for logs_status (one request by id, or all when omitted). */
export const logsStatusInputShape = {
    counterId,
    requestId: requestId
        .optional()
        .describe(
            'Log request id to inspect. Omit to list all requests and current quota usage.',
        ),
}

/** Input shape for logs_download. */
export const logsDownloadInputShape = {
    counterId,
    requestId,
    mode: downloadMode,
    maxRows,
    outputPath,
}

/** Input shape for logs_clean (cleans a finished request, or cancels a running one). */
export const logsCleanInputShape = {
    counterId,
    requestId,
}
