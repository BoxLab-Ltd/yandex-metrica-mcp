import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import {
    logsDownloadInputShape,
    logsRequestInputShape,
    reportInputShape,
} from '../src/mcp/tools/shared.js'

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

const logsRequestSchema = z.object(logsRequestInputShape)
const logsDownloadSchema = z.object(logsDownloadInputShape)

describe('logs_request input schema', () => {
    it('accepts a well-formed request', () => {
        expect(
            logsRequestSchema.safeParse({
                source: 'visits',
                fields: ['ym:s:visitID'],
                date1: '2020-01-01',
                date2: '2020-01-31',
            }).success,
        ).toBe(true)
    })

    it('rejects an unknown source and an empty fields list', () => {
        expect(
            logsRequestSchema.safeParse({
                source: 'sessions',
                fields: ['ym:s:visitID'],
                date1: '2020-01-01',
                date2: '2020-01-31',
            }).success,
        ).toBe(false)
        expect(
            logsRequestSchema.safeParse({
                source: 'visits',
                fields: [],
                date1: '2020-01-01',
                date2: '2020-01-31',
            }).success,
        ).toBe(false)
    })
})

describe('logs_download input schema', () => {
    it('accepts both modes and requires requestId', () => {
        expect(
            logsDownloadSchema.safeParse({ requestId: 1, mode: 'file' })
                .success,
        ).toBe(true)
        expect(logsDownloadSchema.safeParse({ mode: 'sample' }).success).toBe(
            false,
        )
    })

    it('caps maxRows at 1000', () => {
        expect(
            logsDownloadSchema.safeParse({ requestId: 1, maxRows: 1000 })
                .success,
        ).toBe(true)
        expect(
            logsDownloadSchema.safeParse({ requestId: 1, maxRows: 5000 })
                .success,
        ).toBe(false)
    })
})
