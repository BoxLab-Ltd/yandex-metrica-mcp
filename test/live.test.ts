import { describe, expect, it } from 'bun:test'
import { MetricaClient } from '../src/api/client.js'
import { listCounters, listGoals } from '../src/api/metadata.js'
import { runReport } from '../src/api/reporting.js'
import { resolveTokenProvider } from '../src/auth/resolve.js'
import { loadConfig } from '../src/config.js'

/**
 * Live end-to-end against the real Yandex Metrica API — opt-in with `YM_LIVE=1`
 * (and a cached login or YANDEX_METRIKA_TOKEN). Skipped by default and in CI, so
 * `bun test` stays fast and offline. Run it with `YM_LIVE=1 bun test`.
 */
const LIVE = process.env.YM_LIVE === '1'
const suite = LIVE ? describe : describe.skip

suite('live: Reporting + Management (read-only)', () => {
    const config = loadConfig()
    const { provider } = resolveTokenProvider(config)
    const client = new MetricaClient({
        baseUrl: config.baseUrl,
        getToken: () => provider.getAccessToken(),
        onUnauthorized: rejected => provider.forceRefresh(rejected),
        canRefresh: () => provider.canRefresh(),
        userAgent: config.userAgent,
        maxConcurrency: config.maxConcurrency,
        requestTimeoutMs: config.requestTimeoutMs,
        lang: config.lang,
    })

    it('lists the counters the token can see', async () => {
        const counters = await listCounters(client)
        expect(Array.isArray(counters)).toBe(true)
        for (const c of counters) expect(typeof c.id).toBe('number')
    })

    it('lists goals and runs a 7-day traffic-source report', async () => {
        const counters = await listCounters(client)
        if (counters.length === 0) return // nothing to query with this token

        const counterId = config.defaultCounterId ?? counters[0]!.id
        const goals = await listGoals(client, counterId)
        expect(Array.isArray(goals)).toBe(true)

        const metrics = ['ym:s:visits', 'ym:s:users']
        const report = await runReport(client, {
            ids: counterId,
            metrics,
            dimensions: ['ym:s:lastsignTrafficSource'],
            date1: '7daysAgo',
            date2: 'yesterday',
            sort: ['-ym:s:visits'],
            limit: 10,
        })
        expect(Array.isArray(report.data)).toBe(true)
        // Metrics map positionally to the request, so each row echoes all of them.
        for (const row of report.data) {
            expect(row.metrics.length).toBe(metrics.length)
        }
    })
})
