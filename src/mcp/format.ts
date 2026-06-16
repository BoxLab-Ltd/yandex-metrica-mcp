import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type {
    BytimeResponse,
    ComparisonResponse,
    DataResponse,
    DimensionObject,
    DrilldownResponse,
} from '../api/schemas.js'

/** The subset of response meta we surface back to the model. */
interface SamplingMeta {
    total_rows?: number
    sampled?: boolean
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
        returned_rows: returnedRows,
        sampled: resp.sampled ?? false,
        sample_share: resp.sample_share ?? null,
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

function withNotice(
    structured: Record<string, unknown>,
    resp: SamplingMeta,
): Record<string, unknown> {
    const notice = samplingNotice(resp)
    if (notice) structured.sampling_notice = notice
    return structured
}

/** Shape a `/stat/v1/data` response into a keyed, context-friendly object. */
export function formatDataResponse(
    resp: DataResponse,
    dimensions: string[],
    metrics: string[],
    full: boolean,
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
    )
}

/** Shape a `/stat/v1/data/comparison` response, computing deltas server-side. */
export function formatComparisonResponse(
    resp: ComparisonResponse,
    dimensions: string[],
    metrics: string[],
    full: boolean,
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
            meta: buildMeta(resp, rows.length),
        },
        resp,
    )
}

/** Shape a `/stat/v1/data/drilldown` response (singular dimension + expand). */
export function formatDrilldownResponse(
    resp: DrilldownResponse,
    metrics: string[],
    full: boolean,
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
 * Shape a `/stat/v1/data/bytime` response. Each metric becomes an array of
 * values, one per time interval from date1..date2 at the given `group`. The
 * interval timestamps are not returned by the API, so we surface `group` and
 * the resolved date range and leave axis reconstruction to the caller.
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
    return withNotice(
        {
            rows,
            totals: resp.totals ? mapMetricSeries(metrics, resp.totals) : null,
            time_axis: {
                group,
                date1: (q?.date1 as string) ?? null,
                date2: (q?.date2 as string) ?? null,
                note: 'Each metric is an array of values, one per interval from date1 to date2 at the given group.',
            },
            meta: buildMeta(resp, rows.length),
        },
        resp,
    )
}

/** Wrap a structured object as a successful tool result (text + structured). */
export function toToolResult(
    structured: Record<string, unknown>,
): CallToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
        structuredContent: structured,
    }
}

/** Wrap an error as a tool result the model can read and recover from. */
export function errorResult(err: unknown): CallToolResult {
    const message = err instanceof Error ? err.message : String(err)
    return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
    }
}
