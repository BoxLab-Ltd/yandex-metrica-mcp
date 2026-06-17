import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { runReport } from '../../api/reporting.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import { errorResult, formatDataResponse, toToolResult } from '../format.js'
import { DEFAULT_DATE1, DEFAULT_DATE2, reportInputShape } from './shared.js'

export function registerRunReport(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
        'run_report',
        {
            title: 'Run Metrica report',
            description:
                'Query a Yandex Metrica table report (/stat/v1/data): one or more metrics grouped by ' +
                'dimensions over a date range, with optional filter and sort. Read-only. Use get_metadata ' +
                'first to discover valid metric/dimension ids and the account counters.',
            inputSchema: reportInputShape,
            annotations: {
                title: 'Run Metrica report',
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                const dimensions = args.dimensions ?? []
                const resp = await runReport(ctx.client, {
                    ids: counterId,
                    metrics: args.metrics,
                    dimensions: args.dimensions,
                    date1: args.date1 ?? DEFAULT_DATE1,
                    date2: args.date2 ?? DEFAULT_DATE2,
                    filters: args.filters,
                    sort: args.sort,
                    limit: args.limit ?? ctx.config.defaultRowLimit,
                    offset: args.offset,
                    accuracy: args.accuracy,
                    timezone: args.timezone,
                    preset: args.preset,
                    includeUndefined: args.includeUndefined,
                })
                return toToolResult(
                    formatDataResponse(
                        resp,
                        dimensions,
                        args.metrics,
                        args.fullResponse ?? false,
                        args.offset ?? 1,
                    ),
                )
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
