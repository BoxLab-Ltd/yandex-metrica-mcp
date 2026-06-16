import { describe, expect, it } from 'bun:test'
import {
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
        })
    })
})
