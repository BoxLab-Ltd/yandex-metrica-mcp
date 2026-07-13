/**
 * Live smoke against the real Logs API. Tiny + self-cleaning:
 *
 *   YANDEX_METRIKA_TOKEN=<token> bun run scripts/try-logs.ts [counterId] [YYYY-MM-DD]
 *
 * Lists counters (read-only) first; only if the target counter is visible does it
 * create a 1-day, 3-field visits request, poll it, download a small sample, then
 * clean it up. Uses the same api/client code the MCP tools use.
 */
import { MetricaClient } from '../src/api/client.js'
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
import { resolveTokenProvider } from '../src/auth/resolve.js'
import { loadConfig } from '../src/config.js'

const BOXLAB_COUNTER = 105619698
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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
    console.log(`counters visible to this token (${counters.length}):`)
    for (const c of counters) {
        console.log(
            `  ${c.id}  ${c.name ?? ''}  ${c.site2?.site ?? c.site ?? ''}`,
        )
    }

    const wanted = process.argv[2]
        ? Number(process.argv[2])
        : (config.defaultCounterId ?? BOXLAB_COUNTER)
    if (!counters.some(c => c.id === wanted)) {
        console.log(
            `\nCounter ${wanted} is NOT in this token's list — stopping before creating anything.`,
        )
        return
    }

    const day =
        process.argv[3] ??
        new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
    const source = 'visits' as const
    const fields = ['ym:s:visitID', 'ym:s:dateTime', 'ym:s:startURL']
    console.log(`\nusing counter ${wanted}, ${source} for ${day}`)
    console.log(`fields: ${fields.join(', ')}`)

    assertFieldsMatchSource(source, fields)
    assertValidDateRange(day, day)

    const evaluation = await evaluateLogRequest(client, wanted, {
        date1: day,
        date2: day,
        source,
        fields,
    })
    console.log(
        `\nevaluate → possible=${evaluation.possible} max_days=${evaluation.max_possible_day_quantity ?? '?'}`,
    )
    if (!evaluation.possible) {
        console.log('Not feasible right now — stopping.')
        return
    }

    let req = await createLogRequest(client, wanted, {
        date1: day,
        date2: day,
        source,
        fields,
    })
    console.log(`create → request_id=${req.request_id} status=${req.status}`)

    try {
        const deadline = Date.now() + 240_000
        while (!isProcessed(req.status) && !isTerminal(req.status)) {
            if (Date.now() > deadline) {
                console.log(
                    '\nStill not ready after 240s — leaving it; re-run to resume.',
                )
                return
            }
            await sleep(5000)
            req = await getLogRequest(client, wanted, req.request_id)
            console.log(`  poll → status=${req.status}`)
        }

        if (!isProcessed(req.status)) {
            console.log(
                `\nEnded in terminal status ${req.status} — nothing to download.`,
            )
            return
        }

        const parts = req.parts?.length ?? 0
        console.log(
            `\nprocessed → size=${req.size ?? '?'} bytes, parts=${parts}`,
        )

        const sample = await downloadLogSample(
            client,
            wanted,
            req.request_id,
            5,
        )
        console.log(
            `\nsample (${sample.rows.length} rows, truncated=${sample.truncated}):`,
        )
        console.log(`  header: ${sample.header.join(' | ')}`)
        for (const row of sample.rows) {
            console.log(`  ${sample.header.map(h => row[h]).join(' | ')}`)
        }
    } finally {
        const cleaned = await cleanLogRequest(client, wanted, req.request_id)
        console.log(`\nclean → status=${cleaned.status} (quota freed)`)
    }
}

main().catch((err: unknown) => {
    console.error('\nfailed:', err instanceof Error ? err.message : err)
    process.exit(1)
})
