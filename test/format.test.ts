import { YandexApiError } from '@boxlab/yandex-mcp-core'
import { describe, expect, it } from 'bun:test'
import {
    errorResult,
    formatBytimeResponse,
    formatComparisonResponse,
    formatDataResponse,
    formatDrilldownResponse,
} from '../src/mcp/format.js'
import type {
    BytimeResponse,
    ComparisonResponse,
    DataResponse,
    DrilldownResponse,
} from '../src/api/schemas.js'

describe('formatDataResponse', () => {
    const resp = {
        data: [
            {
                dimensions: [{ name: 'Yandex', id: '2', favicon: 'yandex.ru' }],
                metrics: [12045, 9876],
            },
            {
                dimensions: [{ name: 'Google', id: '3' }],
                metrics: [3120, 2654],
            },
        ],
        totals: [15165, 12530],
        total_rows: 2,
        sampled: false,
    } as unknown as DataResponse

    it('keys dimensions and metrics by their requested ids (field selection: name only)', () => {
        const out = formatDataResponse(
            resp,
            ['ym:s:searchEngineName'],
            ['ym:s:visits', 'ym:s:users'],
            false,
        )
        const rows = out.rows as Array<Record<string, Record<string, unknown>>>
        expect(rows[0]!.dimensions).toEqual({
            'ym:s:searchEngineName': 'Yandex',
        })
        expect(rows[0]!.metrics).toEqual({
            'ym:s:visits': 12045,
            'ym:s:users': 9876,
        })
        expect(out.totals).toEqual({
            'ym:s:visits': 15165,
            'ym:s:users': 12530,
        })
        expect(out.sampling_notice).toBeUndefined()
        expect(out.truncation_notice).toBeUndefined()
    })

    it('adds a truncation notice when more rows exist than were returned', () => {
        const more = { ...resp, total_rows: 100 } as unknown as DataResponse
        const out = formatDataResponse(
            more,
            ['ym:s:searchEngineName'],
            ['ym:s:visits', 'ym:s:users'],
            false,
        )
        expect(out.truncation_notice).toContain('100')
        expect(out.truncation_notice).toContain('offset')
    })

    it('omits the truncation notice on the tail page (offset reaches the end)', () => {
        // resp has 2 rows; with offset 4 they are rows 4-5 of 5 — nothing after.
        const tail = { ...resp, total_rows: 5 } as unknown as DataResponse
        const out = formatDataResponse(
            tail,
            ['ym:s:searchEngineName'],
            ['ym:s:visits', 'ym:s:users'],
            false,
            4,
        )
        expect(out.truncation_notice).toBeUndefined()
    })

    it('includes full dimension objects when fullResponse=true', () => {
        const out = formatDataResponse(
            resp,
            ['ym:s:searchEngineName'],
            ['ym:s:visits', 'ym:s:users'],
            true,
        )
        const rows = out.rows as Array<{ dimensions: Record<string, unknown> }>
        expect(rows[0]!.dimensions['ym:s:searchEngineName']).toMatchObject({
            name: 'Yandex',
            id: '2',
            favicon: 'yandex.ru',
        })
    })

    it('adds a sampling notice when the result is sampled', () => {
        const sampled = {
            ...resp,
            sampled: true,
            sample_share: 0.1,
        } as unknown as DataResponse
        const out = formatDataResponse(sampled, [], ['ym:s:visits'], false)
        expect(out.sampling_notice).toContain('sample')
        expect((out.meta as Record<string, unknown>).sampled).toBe(true)
    })

    it('surfaces contains_sensitive_data in metadata', () => {
        const limited = {
            ...resp,
            contains_sensitive_data: true,
        } as unknown as DataResponse
        const out = formatDataResponse(limited, [], ['ym:s:visits'], false)
        expect(
            (out.meta as Record<string, unknown>).contains_sensitive_data,
        ).toBe(true)
    })
})

describe('formatComparisonResponse', () => {
    it('computes absolute and percentage deltas server-side', () => {
        const resp = {
            data: [
                {
                    dimensions: [{ name: 'Male', id: 'male' }],
                    metrics: { a: [5400], b: [5810] },
                },
            ],
            totals: { a: [5400], b: [5810] },
            total_rows: 1,
            sampled: false,
        } as unknown as ComparisonResponse

        const out = formatComparisonResponse(
            resp,
            ['ym:s:gender'],
            ['ym:s:visits'],
            false,
        )
        const rows = out.rows as Array<{ metrics: Record<string, unknown> }>
        expect(rows[0]!.metrics['ym:s:visits']).toEqual({
            a: 5400,
            b: 5810,
            delta: 410,
            delta_pct: 7.59,
        })
    })

    it('returns null delta_pct when the base value is zero', () => {
        const resp = {
            data: [
                { dimensions: [{ name: 'x' }], metrics: { a: [0], b: [5] } },
            ],
            total_rows: 1,
            sampled: false,
        } as unknown as ComparisonResponse
        const out = formatComparisonResponse(resp, ['d'], ['m'], false)
        const rows = out.rows as Array<{
            metrics: Record<string, { delta_pct: number | null }>
        }>
        expect(rows[0]!.metrics.m!.delta_pct).toBeNull()
    })

    it('documents the delta convention (B − A, A is baseline) in the payload', () => {
        const resp = {
            data: [
                { dimensions: [{ name: 'x' }], metrics: { a: [10], b: [12] } },
            ],
            total_rows: 1,
            sampled: false,
        } as unknown as ComparisonResponse
        const out = formatComparisonResponse(resp, ['d'], ['m'], false)
        expect(out.delta_convention).toContain('b - a')
    })
})

describe('formatDrilldownResponse', () => {
    it('exposes the singular dimension, its id, and the expandable flag', () => {
        const resp = {
            data: [
                {
                    dimension: {
                        id: '100',
                        name: 'Windows',
                        icon_id: 'windows',
                    },
                    metrics: [21779, 17786],
                    expand: true,
                },
            ],
            totals: [26822, 22596],
            total_rows: 1,
            sampled: false,
        } as unknown as DrilldownResponse

        const out = formatDrilldownResponse(
            resp,
            ['ym:s:visits', 'ym:s:users'],
            false,
        )
        const rows = out.rows as Array<Record<string, unknown>>
        expect(rows[0]!.dimension).toBe('Windows')
        expect(rows[0]!.dimension_id).toBe('100')
        expect(rows[0]!.metrics).toEqual({
            'ym:s:visits': 21779,
            'ym:s:users': 17786,
        })
        expect(rows[0]!.expandable).toBe(true)
    })
})

describe('formatBytimeResponse', () => {
    it('maps each metric to its per-interval series and surfaces the time axis', () => {
        const resp = {
            query: { date1: '2026-06-08', date2: '2026-06-14' },
            data: [
                {
                    dimensions: [],
                    metrics: [[1200, 1340, 1100, 1500, 1620, 980, 1010]],
                },
            ],
            totals: [[1200, 1340, 1100, 1500, 1620, 980, 1010]],
            total_rows: 1,
            sampled: false,
        } as unknown as BytimeResponse

        const out = formatBytimeResponse(
            resp,
            [],
            ['ym:s:visits'],
            'day',
            false,
        )
        const rows = out.rows as Array<{ metrics: Record<string, unknown> }>
        expect(rows[0]!.metrics['ym:s:visits']).toEqual([
            1200, 1340, 1100, 1500, 1620, 980, 1010,
        ])
        expect(out.time_axis).toMatchObject({
            group: 'day',
            date1: '2026-06-08',
            date2: '2026-06-14',
            interval_count: 7,
            dates: [
                '2026-06-08',
                '2026-06-09',
                '2026-06-10',
                '2026-06-11',
                '2026-06-12',
                '2026-06-13',
                '2026-06-14',
            ],
        })
    })

    it('steps the date axis by calendar month for group=month (not +30 days)', () => {
        const resp = {
            query: { date1: '2026-01-01', date2: '2026-04-30' },
            data: [{ dimensions: [], metrics: [[10, 20, 30, 40]] }],
            total_rows: 1,
            sampled: false,
        } as unknown as BytimeResponse

        const out = formatBytimeResponse(
            resp,
            [],
            ['ym:s:visits'],
            'month',
            false,
        )
        expect(out.time_axis).toMatchObject({
            interval_count: 4,
            dates: ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'],
        })
    })

    it('returns dates=null for group=all (axis not derivable from the range)', () => {
        const resp = {
            query: { date1: '2026-01-01', date2: '2026-04-30' },
            data: [{ dimensions: [], metrics: [[1234]] }],
            total_rows: 1,
            sampled: false,
        } as unknown as BytimeResponse

        const out = formatBytimeResponse(resp, [], ['ym:s:visits'], 'all', false)
        expect((out.time_axis as { dates: unknown }).dates).toBeNull()
        expect((out.time_axis as { interval_count: number }).interval_count).toBe(
            1,
        )
    })

    const axisFor = (
        date1: string,
        date2: string,
        group: string,
        n: number,
    ) => {
        const resp = {
            query: { date1, date2 },
            data: [{ dimensions: [], metrics: [Array(n).fill(1)] }],
            total_rows: 1,
            sampled: false,
        } as unknown as BytimeResponse
        return (
            formatBytimeResponse(resp, [], ['ym:s:visits'], group, false)
                .time_axis as { dates: string[] | null }
        ).dates
    }

    it('snaps a mid-week date1 back to Monday for group=week', () => {
        // 2026-06-10 is a Wednesday; Metrica buckets to Monday-start ISO weeks.
        expect(axisFor('2026-06-10', '2026-06-23', 'week', 3)).toEqual([
            '2026-06-08',
            '2026-06-15',
            '2026-06-22',
        ])
    })

    it('steps months from the 1st with no short-month overflow (date1=Jan 31)', () => {
        // Naive setUTCMonth(+1) on Jan 31 would skip to Mar 3; must stay calendar.
        expect(axisFor('2026-01-31', '2026-04-15', 'month', 4)).toEqual([
            '2026-01-01',
            '2026-02-01',
            '2026-03-01',
            '2026-04-01',
        ])
    })

    it('snaps to the quarter start for group=quarter', () => {
        expect(axisFor('2025-02-10', '2025-08-10', 'quarter', 3)).toEqual([
            '2025-01-01',
            '2025-04-01',
            '2025-07-01',
        ])
    })

    it('snaps to Jan 1 for group=year', () => {
        expect(axisFor('2024-03-05', '2026-02-01', 'year', 3)).toEqual([
            '2024-01-01',
            '2025-01-01',
            '2026-01-01',
        ])
    })

    it('returns dates=null for group=hour (needs the counter timezone)', () => {
        expect(axisFor('2026-06-10', '2026-06-11', 'hour', 24)).toBeNull()
    })
})

describe('errorResult', () => {
    it('adds a re-auth hint and structured content for an invalid/expired token (401)', () => {
        const out = errorResult(
            new YandexApiError(401, 'Yandex API 401: invalid_token', [
                'invalid_token',
            ]),
        )
        expect(out.isError).toBe(true)
        const sc = out.structuredContent as Record<string, unknown>
        expect(sc.status).toBe(401)
        expect(sc.error_types).toEqual(['invalid_token'])
        expect(String(sc.hint)).toContain('auth')
        expect((out.content[0] as { text: string }).text).toContain('auth')
    })

    it('does NOT suggest re-auth for a 403 counter-access denial', () => {
        const out = errorResult(
            new YandexApiError(403, 'Yandex API 403: access_denied', [
                'access_denied',
            ]),
        )
        const sc = out.structuredContent as Record<string, unknown>
        expect(String(sc.hint)).toContain('Access denied')
        expect(String(sc.hint).toLowerCase()).not.toContain('re-authenticate')
    })

    it('passes a plain (non-API) error through without structured content', () => {
        const out = errorResult(new Error('boom'))
        expect(out.isError).toBe(true)
        expect(out.structuredContent).toBeUndefined()
        expect((out.content[0] as { text: string }).text).toContain('boom')
    })
})
