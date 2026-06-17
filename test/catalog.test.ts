import { describe, expect, it } from 'bun:test'
import { DIMENSIONS, METRICS } from '../src/api/catalog.js'

describe('catalog', () => {
    const all = [...DIMENSIONS, ...METRICS]

    it('every catalog id lives in a ym: namespace', () => {
        for (const e of all) expect(e.id.startsWith('ym:')).toBe(true)
    })

    it('e-commerce revenue ids carry the <currency> token (0.1.3 regression)', () => {
        const revenue = all.filter(e => /ConvertedRevenue/.test(e.id))
        expect(revenue.length).toBeGreaterThan(0)
        for (const e of revenue) expect(e.id).toContain('<currency>')
        // The pre-0.1.3 currency-less id returned "incorrectly specified
        // metric" (4002) on every query — it must never come back.
        expect(all.some(e => e.id === 'ym:s:ecommerceConvertedRevenue')).toBe(
            false,
        )
    })
})
