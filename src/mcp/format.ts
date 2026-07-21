import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
    errorResult as coreErrorResult,
    toToolResult,
} from '@boxlab/yandex-mcp-core'
import {
    isProcessed,
    isTerminal,
    LOG_QUOTA_BYTES,
    type LogFileResult,
    type LogSample,
} from '../api/logs.js'
import type {
    BytimeResponse,
    ComparisonResponse,
    DataResponse,
    DimensionObject,
    DrilldownResponse,
    LogRequest,
} from '../api/schemas.js'

/** The subset of response meta we surface back to the model. */
interface SamplingMeta {
    total_rows?: number
    total_rows_rounded?: boolean
    sampled?: boolean
    contains_sensitive_data?: boolean
    sample_share?: number
    sample_size?: number
    sample_space?: number
    data_lag?: number
}

function buildMeta(
    resp: SamplingMeta,
    returnedRows: number,
): Record<string, unknown> {
    return {
        total_rows: resp.total_rows ?? null,
        total_rows_approximate: resp.total_rows_rounded ?? false,
        returned_rows: returnedRows,
        sampled: resp.sampled ?? false,
        sample_share: resp.sample_share ?? null,
        contains_sensitive_data: resp.contains_sensitive_data ?? false,
        data_lag_seconds: resp.data_lag ?? null,
    }
}

function samplingNotice(resp: SamplingMeta): string | undefined {
    if (!resp.sampled) return undefined
    const share =
        resp.sample_share !== undefined
            ? ` (sample_share=${resp.sample_share})`
            : ''
    return (
        `Result is based on a data sample${share}. For exact figures, narrow the date range, ` +
        `reduce the number of dimensions, or set accuracy="full".`
    )
}

/** Field selection: by default emit only the dimension name to save context. */
function dimValue(dim: DimensionObject | undefined, full: boolean): unknown {
    if (!dim) return null
    return full ? dim : (dim.name ?? null)
}

function mapDimensions(
    ids: string[],
    dims: DimensionObject[],
    full: boolean,
): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    ids.forEach((id, i) => {
        out[id] = dimValue(dims[i], full)
    })
    return out
}

function mapMetrics(
    ids: string[],
    values: (number | null)[],
): Record<string, number | null> {
    const out: Record<string, number | null> = {}
    ids.forEach((id, i) => {
        out[id] = values[i] ?? null
    })
    return out
}

function round2(n: number): number {
    return Math.round(n * 100) / 100
}

interface ComparedMetric {
    a: number | null
    b: number | null
    delta: number | null
    delta_pct: number | null
}

function compareMetric(
    a: number | null | undefined,
    b: number | null | undefined,
): ComparedMetric {
    const av = a ?? null
    const bv = b ?? null
    let delta: number | null = null
    let deltaPct: number | null = null
    if (av !== null && bv !== null) {
        delta = round2(bv - av)
        deltaPct = av !== 0 ? round2(((bv - av) / av) * 100) : null
    }
    return { a: av, b: bv, delta, delta_pct: deltaPct }
}

/**
 * Warn the model when more rows exist than were returned, so it does not mistake
 * one page for the whole dataset. Reads the already-built `meta` so no extra
 * params need threading through the formatters.
 */
function truncationNotice(
    structured: Record<string, unknown>,
    offset: number,
): string | undefined {
    const meta = structured.meta as Record<string, unknown> | undefined
    const total = meta?.total_rows
    const returned = meta?.returned_rows
    if (typeof total !== 'number' || typeof returned !== 'number') {
        return undefined
    }
    // Rows accounted for up to and including this page. Only warn when rows
    // remain AFTER this slice, so a tail/last page stays silent rather than
    // telling the model to keep paging past the end.
    const seen = offset - 1 + returned
    if (seen >= total) return undefined
    const remaining = total - seen
    const approx = meta?.total_rows_approximate === true ? '~' : ''
    return (
        `Returned ${returned} of ${approx}${total} matching rows ` +
        `(rows ${offset}-${offset + returned - 1}); ${remaining} more remain after ` +
        `this page — raise "limit" or advance "offset" to fetch them.`
    )
}

function withNotice(
    structured: Record<string, unknown>,
    resp: SamplingMeta,
    offset = 1,
): Record<string, unknown> {
    const notice = samplingNotice(resp)
    if (notice) structured.sampling_notice = notice
    const truncation = truncationNotice(structured, offset)
    if (truncation) structured.truncation_notice = truncation
    return structured
}

/** Shape a `/stat/v1/data` response into a keyed, context-friendly object. */
export function formatDataResponse(
    resp: DataResponse,
    dimensions: string[],
    metrics: string[],
    full: boolean,
    offset = 1,
): Record<string, unknown> {
    const rows = resp.data.map(row => ({
        dimensions: mapDimensions(dimensions, row.dimensions, full),
        metrics: mapMetrics(metrics, row.metrics),
    }))
    return withNotice(
        {
            rows,
            totals: resp.totals ? mapMetrics(metrics, resp.totals) : null,
            meta: buildMeta(resp, rows.length),
        },
        resp,
        offset,
    )
}

/** Shape a `/stat/v1/data/comparison` response, computing deltas server-side. */
export function formatComparisonResponse(
    resp: ComparisonResponse,
    dimensions: string[],
    metrics: string[],
    full: boolean,
    offset = 1,
): Record<string, unknown> {
    const mapCompared = (m: { a: (number | null)[]; b: (number | null)[] }) =>
        Object.fromEntries(
            metrics.map((id, i) => [id, compareMetric(m.a[i], m.b[i])]),
        )

    const rows = resp.data.map(row => ({
        dimensions: mapDimensions(dimensions, row.dimensions, full),
        metrics: mapCompared(row.metrics),
    }))
    return withNotice(
        {
            rows,
            totals: resp.totals ? mapCompared(resp.totals) : null,
            delta_convention:
                'delta = b - a; delta_pct = (b - a) / a * 100. Segment A is the baseline. ' +
                'With default dates A is the earlier period and B the recent one, so positive delta = growth.',
            meta: buildMeta(resp, rows.length),
        },
        resp,
        offset,
    )
}

/** Shape a `/stat/v1/data/drilldown` response (singular dimension + expand). */
export function formatDrilldownResponse(
    resp: DrilldownResponse,
    metrics: string[],
    full: boolean,
    offset = 1,
): Record<string, unknown> {
    const rows = resp.data.map(row => ({
        dimension: full ? row.dimension : (row.dimension.name ?? null),
        dimension_id: row.dimension.id ?? null,
        metrics: mapMetrics(metrics, row.metrics),
        expandable: row.expand ?? false,
    }))
    return withNotice(
        {
            rows,
            totals: resp.totals ? mapMetrics(metrics, resp.totals) : null,
            meta: buildMeta(resp, rows.length),
            hint: 'To expand a row where expandable=true, call run_drilldown again with parentId set to the path of dimension ids/names down to that row.',
        },
        resp,
        offset,
    )
}

/** Map each requested metric id to its time-series array (one value per interval). */
function mapMetricSeries(
    ids: string[],
    series: (number | null)[][],
): Record<string, (number | null)[]> {
    const out: Record<string, (number | null)[]> = {}
    ids.forEach((id, i) => {
        out[id] = series[i] ?? []
    })
    return out
}

/**
 * Snap a UTC date back to the START of its Metrica bucket for `group`. Confirmed
 * against the live API: /bytime buckets to calendar periods — Monday-start ISO
 * weeks, and first-of-period for month/quarter/year — so a mid-period date1 must
 * be aligned before labelling, otherwise every value is tied to the wrong date.
 */
function bucketStart(date: Date, group: string): Date {
    const d = new Date(date)
    d.setUTCHours(0, 0, 0, 0)
    switch (group) {
        case 'week': {
            const mondayOffset = (d.getUTCDay() + 6) % 7 // 0 = Monday
            d.setUTCDate(d.getUTCDate() - mondayOffset)
            break
        }
        case 'month':
            d.setUTCDate(1)
            break
        case 'quarter':
            d.setUTCMonth(d.getUTCMonth() - (d.getUTCMonth() % 3), 1)
            break
        case 'year':
            d.setUTCMonth(0, 1)
            break
        // day: already a day boundary, nothing to snap.
    }
    return d
}

/** Step a bucket-aligned UTC date forward by `n` whole intervals of `group`. */
function stepDate(start: Date, group: string, n: number): Date {
    const d = new Date(start)
    switch (group) {
        case 'week':
            d.setUTCDate(d.getUTCDate() + 7 * n)
            break
        case 'month':
            // `start` is the 1st, so adding months never overflows a short month.
            d.setUTCMonth(d.getUTCMonth() + n)
            break
        case 'quarter':
            d.setUTCMonth(d.getUTCMonth() + 3 * n)
            break
        case 'year':
            d.setUTCFullYear(d.getUTCFullYear() + n)
            break
        default: // day
            d.setUTCDate(d.getUTCDate() + n)
            break
    }
    return d
}

/**
 * Build the per-interval date axis, labelling each value with the START of its
 * Metrica bucket. The anchor is snapped to the bucket boundary and months are
 * stepped from the 1st, so a mid-period date1 (e.g. a Wednesday for `week`, or
 * Jan 31 for `month`) is labelled correctly with no short-month overflow.
 * Returns null when the axis cannot be labelled reliably:
 *   - `all`/`auto`: no fixed interval length;
 *   - `hour`: bucket boundaries follow the counter timezone, unknown here, so
 *     UTC labels would be off by the offset — better to omit than mislead;
 *   - a missing/relative/unparseable date1.
 */
function buildDateAxis(
    date1: string | null,
    group: string,
    count: number,
): string[] | null {
    if (!date1 || group === 'all' || group === 'auto' || group === 'hour') {
        return null
    }
    const parsed = new Date(`${date1}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return null
    const anchor = bucketStart(parsed, group)
    return Array.from({ length: count }, (_, i) =>
        stepDate(anchor, group, i).toISOString().slice(0, 10),
    )
}

/**
 * Shape a `/stat/v1/data/bytime` response. Each metric becomes an array of
 * values, one per time interval at the given `group`. The Metrica API does not
 * return the interval timestamps, so we compute them server-side: `time_axis.dates[i]`
 * is the date for index `i` of every metric series (same length), removing the
 * off-by-one hazard of client-side reconstruction. `dates` is null only when the
 * axis is not derivable (group all/auto, or a relative/missing date1).
 */
export function formatBytimeResponse(
    resp: BytimeResponse,
    dimensions: string[],
    metrics: string[],
    group: string,
    full: boolean,
): Record<string, unknown> {
    const rows = resp.data.map(row => ({
        dimensions: mapDimensions(dimensions, row.dimensions, full),
        metrics: mapMetricSeries(metrics, row.metrics),
    }))
    const q = resp.query as Record<string, unknown> | undefined
    const date1 = (q?.date1 as string) ?? null
    const date2 = (q?.date2 as string) ?? null
    // Derive interval count from the returned series, NOT date1/date2 — that
    // keeps it correct for group 'all'/'auto' where the count is not derivable
    // from the date range alone.
    const intervalCount = Math.max(
        0,
        ...resp.data.flatMap(r => r.metrics.map(s => s.length)),
        ...(resp.totals ?? []).map(s => s.length),
    )
    const dates = buildDateAxis(date1, group, intervalCount)
    return withNotice(
        {
            rows,
            totals: resp.totals ? mapMetricSeries(metrics, resp.totals) : null,
            time_axis: {
                group,
                date1,
                date2,
                interval_count: intervalCount,
                dates,
                note:
                    dates !== null
                        ? 'time_axis.dates[i] is the START of the bucket for index i of every metric series (week=Monday, month/quarter/year=period start); a mid-period date1/date2 means the first/last bucket may be partial.'
                        : 'Per-interval dates are not derivable here (group all/auto/hour, or a relative date1); each metric is a values array of length interval_count spanning date1..date2.',
            },
            meta: buildMeta(resp, rows.length),
        },
        resp,
    )
}

/** A short, actionable next step for the model given a log request's status. */
function logNextStep(req: LogRequest): string {
    const id = req.request_id
    if (isProcessed(req.status)) {
        const parts = req.parts?.length ?? 0
        return (
            `Ready. Call logs_download with request_id=${id} (a bounded sample by default, or mode:"file" ` +
            `for the full ${parts}-part export), then logs_clean to free quota.`
        )
    }
    switch (req.status) {
        case 'created':
        case 'awaiting_retry':
            return `Preparing. Poll logs_status with request_id=${id} every ~30-60s; it is usually ready within minutes.`
        case 'processing_failed':
            return 'Preparation failed. Recreate the request with a smaller date range or fewer fields.'
        case 'canceled':
            return 'Canceled. Create a new request if you still need this data.'
        case 'cleaned_by_user':
        case 'cleaned_automatically_as_too_old':
            return 'The prepared data was cleaned and is no longer downloadable. Recreate the request to fetch it again.'
        default:
            return `Poll logs_status with request_id=${id} for updates.`
    }
}

/** Shape one Logs API request object for the model. */
export function formatLogRequest(req: LogRequest): Record<string, unknown> {
    return {
        request_id: req.request_id,
        status: req.status,
        ready: isProcessed(req.status),
        terminal: isTerminal(req.status),
        source: req.source ?? null,
        date1: req.date1 ?? null,
        date2: req.date2 ?? null,
        fields: req.fields ?? [],
        size_bytes: req.size ?? null,
        parts: req.parts?.length ?? 0,
        attribution: req.attribution ?? null,
        next: logNextStep(req),
    }
}

/** Shape a list of log requests plus current quota usage. */
export function formatLogRequestList(
    reqs: LogRequest[],
): Record<string, unknown> {
    const usedBytes = reqs
        .filter(r => !isTerminal(r.status))
        .reduce((sum, r) => sum + (r.size ?? 0), 0)
    return {
        requests: reqs.map(r => ({
            request_id: r.request_id,
            status: r.status,
            ready: isProcessed(r.status),
            source: r.source ?? null,
            date1: r.date1 ?? null,
            date2: r.date2 ?? null,
            size_bytes: r.size ?? null,
            parts: r.parts?.length ?? 0,
        })),
        quota: {
            used_bytes: usedBytes,
            limit_bytes: LOG_QUOTA_BYTES,
            used_pct: round2((usedBytes / LOG_QUOTA_BYTES) * 100),
        },
        note: 'Prepared logs count against the ~10 GB per-counter quota until cleaned. Call logs_clean on finished requests you no longer need.',
    }
}

/** Shape an inline log sample (part 0, bounded). */
export function formatLogSample(
    sample: LogSample,
    containsPersonalData: boolean,
): Record<string, unknown> {
    return {
        mode: 'sample',
        fields: sample.header,
        row_count: sample.rows.length,
        rows: sample.rows,
        truncated: sample.truncated,
        contains_personal_data: containsPersonalData,
        note:
            'Bounded sample from part 0. For the complete export call logs_download with mode:"file"' +
            (sample.truncated ? ' — more rows exist beyond this sample.' : '.'),
    }
}

/** Shape a completed file export (path + preview, never the full content). */
export function formatLogDownload(
    result: LogFileResult,
    containsPersonalData: boolean,
): Record<string, unknown> {
    return {
        mode: 'file',
        file_path: result.filePath,
        fields: result.header,
        rows_written: result.rowsWritten,
        bytes_written: result.bytesWritten,
        parts: result.parts,
        preview: result.preview,
        contains_personal_data: containsPersonalData,
        note: `Full export written to ${result.filePath}. Work with the file directly — it is NOT loaded into context. Call logs_clean with request_id when done to free the counter's quota.`,
    }
}

export { toToolResult }

/**
 * Wrap an error as a tool result the model can read and recover from. Delegates
 * to the shared formatter, tailoring the 403 hint to this server's resource
 * (a counter).
 */
export function errorResult(err: unknown): CallToolResult {
    return coreErrorResult(err, { resourceNoun: 'counter' })
}
