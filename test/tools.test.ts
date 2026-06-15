import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { reportInputShape } from '../src/mcp/tools/shared.js'

const schema = z.object(reportInputShape)

describe('report tool input schema', () => {
    it('accepts the documented accuracy keywords and 0..1 shares', () => {
        expect(
            schema.safeParse({ metrics: ['ym:s:visits'], accuracy: 'full' })
                .success,
        ).toBe(true)
        expect(
            schema.safeParse({ metrics: ['ym:s:visits'], accuracy: 'medium' })
                .success,
        ).toBe(true)
        expect(
            schema.safeParse({ metrics: ['ym:s:visits'], accuracy: '0.1' })
                .success,
        ).toBe(true)
    })

    it('rejects an out-of-set accuracy value', () => {
        expect(
            schema.safeParse({ metrics: ['ym:s:visits'], accuracy: 'exact' })
                .success,
        ).toBe(false)
        expect(
            schema.safeParse({ metrics: ['ym:s:visits'], accuracy: '2' })
                .success,
        ).toBe(false)
    })

    it('exposes includeUndefined and timezone inputs', () => {
        const r = schema.safeParse({
            metrics: ['ym:s:visits'],
            includeUndefined: true,
            timezone: '+03:00',
        })
        expect(r.success).toBe(true)
    })

    it('requires at least one metric and caps at 20', () => {
        expect(schema.safeParse({ metrics: [] }).success).toBe(false)
        expect(
            schema.safeParse({ metrics: Array(21).fill('ym:s:visits') })
                .success,
        ).toBe(false)
    })
})
