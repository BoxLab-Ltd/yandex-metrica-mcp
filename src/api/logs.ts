import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MetricaClient } from './client.js'
import {
    LOG_IN_PROGRESS_STATUSES,
    LOG_STATUS_PROCESSED,
    LOG_TERMINAL_STATUSES,
    LogRequestEvaluationWrapperSchema,
    LogRequestsListSchema,
    LogRequestWrapperSchema,
    type LogRequest,
    type LogRequestEvaluation,
} from './schemas.js'
import { parseTsvLine, rowsToObjects } from './tsv.js'

/**
 * Yandex Metrica Logs API — raw, un-sampled session/hit rows. Async lifecycle:
 * evaluate → create → poll until `processed` → download parts → clean. All under
 * the management namespace. See docs/API-NOTES.md.
 */

export type LogSource = 'visits' | 'hits'

/** Total prepared-log storage a counter may hold before `clean` is required. */
export const LOG_QUOTA_BYTES = 10 * 1024 ** 3

export const MAX_FIELDS_LENGTH = 3000

const counterBase = (counterId: number) => `/management/v1/counter/${counterId}`

const partPath = (counterId: number, requestId: number, part: number) =>
    `${counterBase(counterId)}/logrequest/${requestId}/part/${part}/download`

const FIELD_PREFIX: Record<LogSource, string> = {
    visits: 'ym:s:',
    hits: 'ym:pv:',
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isProcessed(status: string): boolean {
    return status === LOG_STATUS_PROCESSED
}
export function isInProgress(status: string): boolean {
    return (LOG_IN_PROGRESS_STATUSES as readonly string[]).includes(status)
}
export function isTerminal(status: string): boolean {
    return (LOG_TERMINAL_STATUSES as readonly string[]).includes(status)
}

/** Field prefixes must match the source; the joined list must fit the API cap. */
export function assertFieldsMatchSource(
    source: LogSource,
    fields: string[],
): void {
    const prefix = FIELD_PREFIX[source]
    const wrong = fields.filter(f => !f.startsWith(prefix))
    if (wrong.length > 0) {
        const other = source === 'visits' ? 'ym:pv:' : 'ym:s:'
        throw new Error(
            `source="${source}" requires ${prefix}* fields, but got: ${wrong.join(', ')}. ` +
                `Fields starting with ${other} belong to the other source — request them separately.`,
        )
    }
    const joinedLength = fields.join(',').length
    if (joinedLength > MAX_FIELDS_LENGTH) {
        throw new Error(
            `The fields list is ${joinedLength} characters; the Logs API allows at most ${MAX_FIELDS_LENGTH}. Request fewer fields.`,
        )
    }
}

/** Dates must be concrete past days (YYYY-MM-DD); the current day is not ready. */
export function assertValidDateRange(date1: string, date2: string): void {
    if (!ISO_DATE.test(date1) || !ISO_DATE.test(date2)) {
        throw new Error(
            `Logs API dates must be concrete YYYY-MM-DD (got date1="${date1}", date2="${date2}"). Relative dates are not supported here.`,
        )
    }
    const today = new Date().toISOString().slice(0, 10)
    if (date2 >= today) {
        throw new Error(
            `date2 must be earlier than today (${today}); the current day's log data is not available yet.`,
        )
    }
    if (date1 > date2) {
        throw new Error(`date1 (${date1}) must not be after date2 (${date2}).`)
    }
}

export interface CreateLogRequestParams {
    date1: string
    date2: string
    source: LogSource
    fields: string[]
    attribution?: string
}

export async function evaluateLogRequest(
    client: MetricaClient,
    counterId: number,
    p: Omit<CreateLogRequestParams, 'attribution'>,
): Promise<LogRequestEvaluation> {
    const raw = await client.requestJson(
        `${counterBase(counterId)}/logrequests/evaluate`,
        {
            params: {
                date1: p.date1,
                date2: p.date2,
                source: p.source,
                fields: p.fields.join(','),
            },
        },
    )
    return LogRequestEvaluationWrapperSchema.parse(raw).log_request_evaluation
}

export async function createLogRequest(
    client: MetricaClient,
    counterId: number,
    p: CreateLogRequestParams,
): Promise<LogRequest> {
    const raw = await client.requestJson(
        `${counterBase(counterId)}/logrequests`,
        {
            method: 'POST',
            params: {
                date1: p.date1,
                date2: p.date2,
                source: p.source,
                fields: p.fields.join(','),
                attribution: p.attribution?.toUpperCase(),
            },
        },
    )
    if (raw && typeof raw === 'object' && 'log_request' in raw) {
        return LogRequestWrapperSchema.parse(raw).log_request
    }
    // A 202 dedup returns an empty body: an identical request is already in
    // flight, so locate and return it rather than failing.
    const inFlight = (await listLogRequests(client, counterId)).find(
        r =>
            r.source === p.source &&
            r.date1 === p.date1 &&
            r.date2 === p.date2 &&
            !isTerminal(r.status),
    )
    if (inFlight) return inFlight
    throw new Error(
        'The log request was accepted but could not be located. Call logs_status to list requests.',
    )
}

export async function getLogRequest(
    client: MetricaClient,
    counterId: number,
    requestId: number,
): Promise<LogRequest> {
    const raw = await client.requestJson(
        `${counterBase(counterId)}/logrequest/${requestId}`,
    )
    return LogRequestWrapperSchema.parse(raw).log_request
}

export async function listLogRequests(
    client: MetricaClient,
    counterId: number,
): Promise<LogRequest[]> {
    const raw = await client.requestJson(
        `${counterBase(counterId)}/logrequests`,
    )
    return LogRequestsListSchema.parse(raw).requests
}

export async function cleanLogRequest(
    client: MetricaClient,
    counterId: number,
    requestId: number,
): Promise<LogRequest> {
    const raw = await client.requestJson(
        `${counterBase(counterId)}/logrequest/${requestId}/clean`,
        { method: 'POST' },
    )
    return LogRequestWrapperSchema.parse(raw).log_request
}

export async function cancelLogRequest(
    client: MetricaClient,
    counterId: number,
    requestId: number,
): Promise<LogRequest> {
    const raw = await client.requestJson(
        `${counterBase(counterId)}/logrequest/${requestId}/cancel`,
        { method: 'POST' },
    )
    return LogRequestWrapperSchema.parse(raw).log_request
}

export interface LogSample {
    header: string[]
    rows: Record<string, string>[]
    truncated: boolean
}

/** Download part 0 up to `maxRows` data rows; the stream stops early past that. */
export async function downloadLogSample(
    client: MetricaClient,
    counterId: number,
    requestId: number,
    maxRows: number,
): Promise<LogSample> {
    let header: string[] | null = null
    const rows: string[][] = []
    let truncated = false
    for await (const line of client.streamLines(
        partPath(counterId, requestId, 0),
    )) {
        if (header === null) {
            header = parseTsvLine(line)
            continue
        }
        if (line === '') continue
        if (rows.length >= maxRows) {
            truncated = true
            break
        }
        rows.push(parseTsvLine(line))
    }
    const cols = header ?? []
    return { header: cols, rows: rowsToObjects(cols, rows), truncated }
}

export interface LogFileResult {
    filePath: string
    header: string[]
    preview: Record<string, string>[]
    rowsWritten: number
    bytesWritten: number
    parts: number
}

/**
 * Stream every part into one TSV file, keeping a single header row (each part
 * repeats it), and return counts plus a small preview. Streaming keeps memory
 * flat regardless of export size.
 */
export async function downloadLogToFile(
    client: MetricaClient,
    counterId: number,
    requestId: number,
    partCount: number,
    filePath: string,
    previewRows: number,
): Promise<LogFileResult> {
    await mkdir(dirname(filePath), { recursive: true })
    const out = createWriteStream(filePath)
    let header: string[] = []
    const preview: string[][] = []
    let rowsWritten = 0
    let bytesWritten = 0

    const write = async (line: string) => {
        const chunk = line + '\n'
        if (!out.write(chunk)) await once(out, 'drain')
        bytesWritten += Buffer.byteLength(chunk)
    }

    try {
        for (let part = 0; part < partCount; part++) {
            let idx = 0
            for await (const line of client.streamLines(
                partPath(counterId, requestId, part),
            )) {
                const isHeader = idx === 0
                idx++
                if (isHeader) {
                    if (part === 0) {
                        header = parseTsvLine(line)
                        await write(line)
                    }
                    continue
                }
                if (line === '') continue
                await write(line)
                rowsWritten++
                if (preview.length < previewRows) {
                    preview.push(parseTsvLine(line))
                }
            }
        }
        out.end()
        await once(out, 'finish')
    } catch (err) {
        out.destroy()
        throw err
    }

    return {
        filePath,
        header,
        preview: rowsToObjects(header, preview),
        rowsWritten,
        bytesWritten,
        parts: partCount,
    }
}
