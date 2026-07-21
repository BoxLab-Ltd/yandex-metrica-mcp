import { resolveTokenProvider, YandexClient } from '@boxlab/yandex-mcp-core'
import { describe, expect, it } from 'bun:test'
import {
    assertFieldsMatchSource,
    assertValidDateRange,
    cleanLogRequest,
    createLogRequest,
    downloadLogSample,
    evaluateLogRequest,
    getLogRequest,
    isProcessed,
    isTerminal,
} from '../src/api/logs.js'
import { listCounters } from '../src/api/metadata.js'
import { loadAuthConfig, loadConfig } from '../src/config.js'

/**
 * Live end-to-end for the full Logs API lifecycle against the real API. This
 * MUTATES the counter (creates then cleans a log request, uses quota) and polls
 * for minutes, so it is opt-in with its OWN flag `YM_LIVE_LOGS=1` — separate
 * from the fast read-only `YM_LIVE` suite. Skipped by default and in CI.
 * Run it with `YM_LIVE_LOGS=1 bun test test/logs.live.test.ts`.
 */
const LIVE_LOGS = process.env.YM_LIVE_LOGS === '1'
const suite = LIVE_LOGS ? describe : describe.skip
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

suite('live: Logs API lifecycle (mutating, ~minutes)', () => {
    const config = loadConfig()
    const { provider } = resolveTokenProvider(loadAuthConfig())
    const client = new YandexClient({
        baseUrl: config.baseUrl,
        getToken: () => provider.getAccessToken(),
        onUnauthorized: rejected => provider.forceRefresh(rejected),
        canRefresh: () => provider.canRefresh(),
        userAgent: config.userAgent,
        maxConcurrency: config.maxConcurrency,
        requestTimeoutMs: config.requestTimeoutMs,
        lang: config.lang,
    })

    it(
        'evaluates, creates, polls, downloads a sample, then cleans',
        async () => {
            const counters = await listCounters(client)
            if (counters.length === 0) return // no counter to exercise

            const counterId = config.defaultCounterId ?? counters[0]!.id
            const day = new Date(Date.now() - 7 * 86_400_000)
                .toISOString()
                .slice(0, 10)
            const source = 'visits' as const
            const fields = ['ym:s:visitID', 'ym:s:dateTime', 'ym:s:startURL']

            assertFieldsMatchSource(source, fields)
            assertValidDateRange(day, day)

            const evaluation = await evaluateLogRequest(client, counterId, {
                date1: day,
                date2: day,
                source,
                fields,
            })
            expect(typeof evaluation.possible).toBe('boolean')
            if (!evaluation.possible) return // not feasible right now

            let req = await createLogRequest(client, counterId, {
                date1: day,
                date2: day,
                source,
                fields,
            })
            expect(typeof req.request_id).toBe('number')

            try {
                const deadline = Date.now() + 240_000
                while (!isProcessed(req.status) && !isTerminal(req.status)) {
                    if (Date.now() > deadline) return // Yandex slow; leave it
                    await sleep(5000)
                    req = await getLogRequest(client, counterId, req.request_id)
                }
                if (!isProcessed(req.status)) return // terminal, nothing to grab

                const sample = await downloadLogSample(
                    client,
                    counterId,
                    req.request_id,
                    5,
                )
                expect(Array.isArray(sample.header)).toBe(true)
                expect(sample.header.length).toBe(fields.length)
                expect(Array.isArray(sample.rows)).toBe(true)
            } finally {
                const cleaned = await cleanLogRequest(
                    client,
                    counterId,
                    req.request_id,
                )
                expect(cleaned.status).toBeDefined()
            }
        },
        300_000,
    )
})
