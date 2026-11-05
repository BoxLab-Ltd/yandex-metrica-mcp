import type { YandexClient } from '@boxlab/yandex-mcp-core'
import {
    ExpenseUploadingResponseSchema,
    type ExpenseUploading,
} from './schemas.js'

const COLUMNS = [
    'Date',
    'UTMSource',
    'TrafficSource',
    'TrafficSourceDetail',
    'Expenses',
    'UTMMedium',
    'UTMCampaign',
    'UTMTerm',
    'UTMContent',
    'Currency',
    'Clicks',
] as const

const DATE = /^\d{4}-\d{2}-\d{2}$/
const NUMBER = /^\d+(\.\d+)?$/
const MAX_ERRORS = 10

export interface ExpensesPreview {
    rows: number
    dateFrom: string
    dateTo: string
    totals: Record<string, number>
    clicks: number | null
    bySource: Array<{ source: string; expenses: number; rows: number }>
    warnings: string[]
}

export type ExpensesValidation =
    { ok: true; preview: ExpensesPreview } | { ok: false; errors: string[] }

function splitCsvLine(line: string): string[] {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]!
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"'
                i++
            } else if (ch === '"') {
                quoted = false
            } else {
                cur += ch
            }
        } else if (ch === '"') {
            quoted = true
        } else if (ch === ',') {
            out.push(cur)
            cur = ''
        } else {
            cur += ch
        }
    }
    out.push(cur)
    return out.map(v => v.trim())
}

function isRealDate(value: string): boolean {
    if (!DATE.test(value)) return false
    const d = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value)
}

export function validateExpensesCsv(
    csv: string,
    today: string = new Date().toISOString().slice(0, 10),
): ExpensesValidation {
    const lines = csv
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((text, i) => ({ text, line: i + 1 }))
        .filter(l => l.text.trim() !== '')
    if (lines.length < 2) {
        return {
            ok: false,
            errors: ['The CSV needs a header row and at least one data row.'],
        }
    }
    const header = splitCsvLine(lines[0]!.text)
    const errors: string[] = []
    const unknown = header.filter(
        h => !(COLUMNS as readonly string[]).includes(h),
    )
    if (unknown.length > 0) {
        errors.push(
            `Unknown column(s): ${unknown.join(', ')}. Allowed: ${COLUMNS.join(', ')} (names are case-sensitive).`,
        )
    }
    const col = (name: string) => header.indexOf(name)
    if (col('Date') < 0) errors.push('Missing required column Date.')
    if (col('Expenses') < 0) errors.push('Missing required column Expenses.')
    if (col('UTMSource') < 0 && col('TrafficSource') < 0) {
        errors.push('Add a UTMSource or a TrafficSource column.')
    }
    if (errors.length > 0) return { ok: false, errors }

    const totals: Record<string, number> = {}
    const sources = new Map<string, { expenses: number; rows: number }>()
    let clicks: number | null = col('Clicks') >= 0 ? 0 : null
    let dateFrom = ''
    let dateTo = ''
    let futureRows = 0

    for (const { text, line } of lines.slice(1)) {
        const cells = splitCsvLine(text)
        const fail = (msg: string) => {
            if (errors.length < MAX_ERRORS) errors.push(`Line ${line}: ${msg}`)
        }
        if (cells.length !== header.length) {
            fail(`expected ${header.length} values, got ${cells.length}.`)
            continue
        }
        const get = (name: string) => (col(name) >= 0 ? cells[col(name)]! : '')

        const parts = get('Date').split('/')
        const from = parts[0] ?? ''
        const to = parts[1] ?? from
        if (
            parts.length > 2 ||
            !isRealDate(from) ||
            !isRealDate(to) ||
            to < from
        ) {
            fail(
                `Date "${get('Date')}" must be YYYY-MM-DD or YYYY-MM-DD/YYYY-MM-DD.`,
            )
            continue
        }
        const source = get('UTMSource') || get('TrafficSource')
        if (!source) {
            fail('needs a UTMSource or TrafficSource value.')
            continue
        }
        const expenses = get('Expenses')
        if (!NUMBER.test(expenses)) {
            fail(
                `Expenses "${expenses}" must be a non-negative number with a dot decimal separator.`,
            )
            continue
        }
        const currency = get('Currency').toUpperCase()
        if (currency && !/^[A-Z]{3}$/.test(currency)) {
            fail(
                `Currency "${get('Currency')}" must be a 3-letter ISO 4217 code.`,
            )
            continue
        }
        const rowClicks = get('Clicks')
        if (clicks !== null && rowClicks !== '') {
            if (!/^\d+$/.test(rowClicks)) {
                fail(`Clicks "${rowClicks}" must be a whole number.`)
                continue
            }
            clicks += Number(rowClicks)
        }

        const amount = Number(expenses)
        const key = currency || 'counter currency'
        totals[key] = (totals[key] ?? 0) + amount
        const s = sources.get(source) ?? { expenses: 0, rows: 0 }
        s.expenses += amount
        s.rows += 1
        sources.set(source, s)
        if (!dateFrom || from < dateFrom) dateFrom = from
        if (!dateTo || to > dateTo) dateTo = to
        if (to > today) futureRows += 1
    }
    if (errors.length > 0) return { ok: false, errors }

    const warnings: string[] = []
    const direct = [...sources.keys()].filter(s => /yandex|direct/i.test(s))
    if (direct.length > 0) {
        warnings.push(
            `Source(s) ${direct.join(', ')} look like Yandex Direct. Direct costs reach Metrica automatically — uploading them again doubles them in reports.`,
        )
    }
    if (futureRows > 0) {
        warnings.push(`${futureRows} row(s) are dated after today.`)
    }
    warnings.push(
        'Uploads add up: sending the same rows twice doubles those expenses (undo needs a removal upload).',
    )

    const round = (n: number) => Math.round(n * 100) / 100
    return {
        ok: true,
        preview: {
            rows: lines.length - 1,
            dateFrom,
            dateTo,
            totals: Object.fromEntries(
                Object.entries(totals).map(([k, v]) => [k, round(v)]),
            ),
            clicks,
            bySource: [...sources.entries()]
                .sort((a, b) => b[1].expenses - a[1].expenses)
                .slice(0, 10)
                .map(([source, v]) => ({
                    source,
                    expenses: round(v.expenses),
                    rows: v.rows,
                })),
            warnings,
        },
    }
}

export async function uploadExpenses(
    client: YandexClient,
    counterId: number,
    csv: string,
    opts: { provider?: string; comment?: string } = {},
): Promise<ExpenseUploading> {
    const form = new FormData()
    form.set('file', new Blob([csv], { type: 'text/csv' }), 'expenses.csv')
    const raw = await client.requestJson(
        `/management/v1/counter/${counterId}/expense/upload`,
        {
            method: 'POST',
            form,
            params: { provider: opts.provider, comment: opts.comment },
        },
    )
    return ExpenseUploadingResponseSchema.parse(raw).uploading
}
