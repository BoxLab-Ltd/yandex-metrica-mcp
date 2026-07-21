import { YandexClient } from '@boxlab/yandex-mcp-core'
import { describe, expect, it, mock } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    assertFieldsMatchSource,
    assertValidDateRange,
    createLogRequest,
    downloadLogSample,
    downloadLogToFile,
    evaluateLogRequest,
    isInProgress,
    isProcessed,
    isTerminal,
    listLogRequests,
} from '../src/api/logs.js'

function makeClient(fetchImpl: typeof fetch) {
    return new YandexClient({
        baseUrl: 'https://api-metrika.yandex.net',
        getToken: async () => 'tok',
        userAgent: 'test/1.0',
        maxConcurrency: 3,
        requestTimeoutMs: 1000,
        fetchImpl,
        sleep: async () => {},
    })
}

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

describe('logs field/date validation', () => {
    it('rejects fields whose prefix does not match the source', () => {
        expect(() =>
            assertFieldsMatchSource('visits', ['ym:s:visitID', 'ym:pv:URL']),
        ).toThrow(/ym:pv:/)
        expect(() =>
            assertFieldsMatchSource('hits', ['ym:pv:URL']),
        ).not.toThrow()
    })

    it('rejects an over-long fields list', () => {
        const many = Array.from({ length: 300 }, (_, i) => `ym:s:field${i}`)
        expect(() => assertFieldsMatchSource('visits', many)).toThrow(/3000/)
    })

    it('rejects relative, current-day, or reversed dates', () => {
        expect(() => assertValidDateRange('7daysAgo', 'yesterday')).toThrow(
            /YYYY-MM-DD/,
        )
        const today = new Date().toISOString().slice(0, 10)
        expect(() => assertValidDateRange('2020-01-01', today)).toThrow(/today/)
        expect(() => assertValidDateRange('2020-02-01', '2020-01-01')).toThrow(
            /after/,
        )
        expect(() =>
            assertValidDateRange('2020-01-01', '2020-01-31'),
        ).not.toThrow()
    })
})

describe('logs status classification', () => {
    it('maps statuses to lifecycle buckets', () => {
        expect(isProcessed('processed')).toBe(true)
        expect(isInProgress('created')).toBe(true)
        expect(isInProgress('awaiting_retry')).toBe(true)
        expect(isTerminal('cleaned_by_user')).toBe(true)
        expect(isTerminal('processed')).toBe(false)
    })
})

describe('createLogRequest', () => {
    it('POSTs CSV fields and an uppercased attribution', async () => {
        let url = ''
        let method = ''
        const fetchImpl = mock(
            async (u: string | URL | Request, init?: RequestInit) => {
                url = String(u)
                method = init?.method ?? ''
                return json(200, {
                    log_request: {
                        request_id: 42,
                        status: 'created',
                        source: 'visits',
                        date1: '2020-01-01',
                        date2: '2020-01-31',
                        fields: ['ym:s:visitID'],
                    },
                })
            },
        ) as unknown as typeof fetch

        const req = await createLogRequest(makeClient(fetchImpl), 111, {
            date1: '2020-01-01',
            date2: '2020-01-31',
            source: 'visits',
            fields: ['ym:s:visitID', 'ym:s:dateTime'],
            attribution: 'last',
        })

        expect(method).toBe('POST')
        expect(url).toContain('/management/v1/counter/111/logrequests?')
        expect(url).toContain('fields=ym%3As%3AvisitID%2Cym%3As%3AdateTime')
        expect(url).toContain('attribution=LAST')
        expect(req.request_id).toBe(42)
    })

    it('resolves a 202 dedup by matching the in-flight request', async () => {
        const fetchImpl = mock(
            async (_u: string | URL | Request, init?: RequestInit) => {
                if (init?.method === 'POST')
                    return new Response('', { status: 202 })
                return json(200, {
                    requests: [
                        {
                            request_id: 7,
                            status: 'created',
                            source: 'visits',
                            date1: '2020-01-01',
                            date2: '2020-01-31',
                        },
                    ],
                })
            },
        ) as unknown as typeof fetch

        const req = await createLogRequest(makeClient(fetchImpl), 111, {
            date1: '2020-01-01',
            date2: '2020-01-31',
            source: 'visits',
            fields: ['ym:s:visitID'],
        })
        expect(req.request_id).toBe(7)
    })
})

describe('evaluateLogRequest', () => {
    it('parses the feasibility response', async () => {
        const fetchImpl = mock(async () =>
            json(200, {
                log_request_evaluation: {
                    possible: true,
                    max_possible_day_quantity: 40,
                },
            }),
        ) as unknown as typeof fetch
        const e = await evaluateLogRequest(makeClient(fetchImpl), 1, {
            date1: '2020-01-01',
            date2: '2020-01-31',
            source: 'visits',
            fields: ['ym:s:visitID'],
        })
        expect(e.possible).toBe(true)
        expect(e.max_possible_day_quantity).toBe(40)
    })
})

describe('listLogRequests', () => {
    it('defaults a missing requests array to empty', async () => {
        const fetchImpl = mock(async () =>
            json(200, {}),
        ) as unknown as typeof fetch
        expect(await listLogRequests(makeClient(fetchImpl), 1)).toEqual([])
    })
})

describe('downloadLogSample', () => {
    it('samples up to maxRows and flags truncation', async () => {
        const body = [
            'ym:s:visitID\tym:s:date',
            '1\t2020-01-01',
            '2\t2020-01-02',
            '3\t2020-01-03',
            '',
        ].join('\n')
        const fetchImpl = mock(
            async () => new Response(body, { status: 200 }),
        ) as unknown as typeof fetch

        const s = await downloadLogSample(makeClient(fetchImpl), 1, 42, 2)
        expect(s.header).toEqual(['ym:s:visitID', 'ym:s:date'])
        expect(s.rows).toHaveLength(2)
        expect(s.rows[0]).toEqual({
            'ym:s:visitID': '1',
            'ym:s:date': '2020-01-01',
        })
        expect(s.truncated).toBe(true)
    })

    it('does not flag truncation when every row fits', async () => {
        const fetchImpl = mock(
            async () => new Response('ym:s:visitID\n1\n2\n'),
        ) as unknown as typeof fetch
        const s = await downloadLogSample(makeClient(fetchImpl), 1, 42, 10)
        expect(s.rows).toHaveLength(2)
        expect(s.truncated).toBe(false)
    })
})

describe('downloadLogToFile', () => {
    it('streams all parts into one file with a single header', async () => {
        const part0 = 'ym:s:visitID\ta\n1\tx\n2\ty\n'
        const part1 = 'ym:s:visitID\ta\n3\tz\n'
        const fetchImpl = mock(
            async (u: string | URL | Request) =>
                new Response(String(u).includes('/part/0/') ? part0 : part1),
        ) as unknown as typeof fetch

        const dir = await mkdtemp(join(tmpdir(), 'logs-test-'))
        const filePath = join(dir, 'out.tsv')
        try {
            const r = await downloadLogToFile(
                makeClient(fetchImpl),
                1,
                42,
                2,
                filePath,
                5,
            )
            expect(r.rowsWritten).toBe(3)
            expect(r.header).toEqual(['ym:s:visitID', 'a'])
            expect(r.preview).toHaveLength(3)
            const content = await readFile(filePath, 'utf8')
            expect(content).toBe('ym:s:visitID\ta\n1\tx\n2\ty\n3\tz\n')
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})
