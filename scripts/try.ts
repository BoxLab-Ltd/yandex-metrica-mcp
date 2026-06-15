/**
 * Quick local smoke against the real Yandex Metrica API — no MCP client needed.
 *
 *   YANDEX_METRIKA_TOKEN=<token> bun run try [counterId]
 *
 * Lists the counters your credentials can see, then (for the chosen counter)
 * its goals and a small last-7-days report. Reuses the same auth + client code
 * the server uses, so a green run means the server itself will work too.
 */
import { MetricaClient } from '../src/api/client.js'
import { listCounters, listGoals } from '../src/api/metadata.js'
import { runReport } from '../src/api/reporting.js'
import { resolveTokenProvider } from '../src/auth/resolve.js'
import { loadConfig } from '../src/config.js'

async function main(): Promise<void> {
    const config = loadConfig()
    const { provider, mode } = resolveTokenProvider(config)
    console.log(`auth source: ${mode}\n`)

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

    const counters = await listCounters(client)
    console.log(`counters (${counters.length}):`)
    for (const c of counters) {
        console.log(
            `  ${c.id}  ${c.name ?? ''}  ${c.site2?.site ?? c.site ?? ''}`,
        )
    }
    if (counters.length === 0) {
        console.log('  (none — does this token have access to any counter?)')
        return
    }

    const argId = process.argv[2] ? Number(process.argv[2]) : undefined
    const counterId = argId ?? config.defaultCounterId ?? counters[0]!.id
    console.log(`\nusing counter ${counterId}`)

    const goals = await listGoals(client, counterId)
    console.log(
        `goals (${goals.length}): ${goals.map(g => g.name ?? g.id).join(', ') || '(none)'}`,
    )

    console.log('\nlast 7 days, visits & users by traffic source:')
    const report = await runReport(client, {
        ids: counterId,
        metrics: ['ym:s:visits', 'ym:s:users'],
        dimensions: ['ym:s:lastsignTrafficSource'],
        date1: '7daysAgo',
        date2: 'yesterday',
        sort: ['-ym:s:visits'],
        limit: 10,
    })
    for (const row of report.data) {
        const source = row.dimensions[0]?.name ?? '(not set)'
        const [visits, users] = row.metrics
        console.log(
            `  ${String(source).padEnd(28)} visits=${visits ?? 0}  users=${users ?? 0}`,
        )
    }
    if (report.sampled) {
        console.log(`\n  note: sampled (sample_share=${report.sample_share})`)
    }
}

main().catch((err: unknown) => {
    console.error('\nfailed:', err instanceof Error ? err.message : err)
    process.exit(1)
})
