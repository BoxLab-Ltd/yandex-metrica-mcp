import { describe, expect, it } from 'bun:test'
import {
    ComparisonResponseSchema,
    CounterResponseSchema,
    CountersResponseSchema,
    DataResponseSchema,
    DrilldownResponseSchema,
    FiltersResponseSchema,
    GoalsResponseSchema,
    GrantsResponseSchema,
    OperationsResponseSchema,
    SegmentsResponseSchema,
} from '../src/api/schemas.js'

describe('response schemas (samples from the verified contract)', () => {
    it('parses a /stat/v1/data response and keeps extra dimension fields', () => {
        const parsed = DataResponseSchema.parse({
            query: { ids: [1] },
            data: [
                {
                    dimensions: [
                        { name: 'Yandex', id: '2', icon_type: 'search-engine' },
                    ],
                    metrics: [12045.0, 9876.0],
                },
            ],
            total_rows: 1,
            sampled: false,
            sample_share: 1.0,
            totals: [12045.0, 9876.0],
            min: [12045.0, 9876.0],
            max: [12045.0, 9876.0],
        })
        expect(parsed.data[0]?.dimensions[0]).toMatchObject({
            name: 'Yandex',
            icon_type: 'search-engine',
        })
        expect(parsed.data[0]?.metrics).toEqual([12045, 9876])
    })

    it('parses a /comparison response with { a, b } metrics', () => {
        const parsed = ComparisonResponseSchema.parse({
            data: [
                {
                    dimensions: [{ name: 'Male', id: 'male' }],
                    metrics: { a: [5400], b: [5810] },
                },
            ],
            total_rows: 1,
            sampled: false,
        })
        expect(parsed.data[0]?.metrics.a).toEqual([5400])
        expect(parsed.data[0]?.metrics.b).toEqual([5810])
    })

    it('parses a /drilldown response with a singular dimension and expand', () => {
        const parsed = DrilldownResponseSchema.parse({
            data: [
                {
                    dimension: { id: '100', name: 'Windows' },
                    metrics: [21779],
                    expand: true,
                },
            ],
            total_rows: 1,
            sampled: false,
        })
        expect(parsed.data[0]?.dimension.name).toBe('Windows')
        expect(parsed.data[0]?.expand).toBe(true)
    })

    it('tolerates null metric values', () => {
        const parsed = DataResponseSchema.parse({
            data: [{ dimensions: [{ name: null }], metrics: [null, 5] }],
            total_rows: 1,
        })
        expect(parsed.data[0]?.metrics).toEqual([null, 5])
    })

    it('parses management counters and goals', () => {
        const counters = CountersResponseSchema.parse({
            rows: 1,
            counters: [
                {
                    id: 123,
                    name: 'Site',
                    site2: { site: 'example.com' },
                    status: 'Active',
                },
            ],
        })
        expect(counters.counters[0]?.site2?.site).toBe('example.com')

        const goals = GoalsResponseSchema.parse({
            goals: [{ id: 7, name: 'Purchase', type: 'action' }],
        })
        expect(goals.goals[0]?.name).toBe('Purchase')
    })

    it('normalizes numeric booleans the API returns (goal is_favorite 0/1)', () => {
        const goals = GoalsResponseSchema.parse({
            goals: [
                { id: 1, name: 'A', is_favorite: 1 },
                { id: 2, name: 'B', is_favorite: 0 },
            ],
        })
        expect(goals.goals[0]?.is_favorite).toBe(true)
        expect(goals.goals[1]?.is_favorite).toBe(false)
    })
})

describe('management read schemas (single-resource + lists)', () => {
    it('unwraps a single counter and keeps the permission field', () => {
        const counter = CounterResponseSchema.parse({
            counter: {
                id: 123,
                name: 'Site',
                site2: { site: 'example.com' },
                status: 'Active',
                permission: 'own',
            },
        }).counter
        expect(counter.id).toBe(123)
        expect(counter.permission).toBe('own')
    })

    it('keeps loosely-typed goal conditions through the goals list', () => {
        const goals = GoalsResponseSchema.parse({
            goals: [
                {
                    id: 7,
                    name: 'Purchase',
                    type: 'url',
                    conditions: [{ type: 'contain', url: '/thank-you' }],
                },
            ],
        }).goals
        expect(goals[0]?.conditions).toEqual([
            { type: 'contain', url: '/thank-you' },
        ])
    })

    it('parses segments, filters, operations and grants lists', () => {
        expect(
            SegmentsResponseSchema.parse({
                segments: [
                    { segment_id: 1, name: 'Buyers', expression: "ym:s:goal==1" },
                ],
            }).segments[0]?.segment_id,
        ).toBe(1)

        expect(
            FiltersResponseSchema.parse({
                filters: [
                    {
                        id: 5,
                        action: 'exclude',
                        attr: 'client_ip',
                        type: 'equal',
                        value: '10.0.0.1',
                    },
                ],
            }).filters[0]?.action,
        ).toBe('exclude')

        expect(
            OperationsResponseSchema.parse({
                operations: [
                    { id: 9, action: 'cut_parameter', attr: 'referer', value: 'gclid' },
                ],
            }).operations[0]?.id,
        ).toBe(9)

        expect(
            GrantsResponseSchema.parse({
                grants: [{ user_login: 'user@ya.ru', perm: 'view' }],
            }).grants[0]?.perm,
        ).toBe('view')
    })

    it('defaults absent list bodies to empty arrays', () => {
        expect(SegmentsResponseSchema.parse({}).segments).toEqual([])
        expect(GrantsResponseSchema.parse({}).grants).toEqual([])
    })
})
