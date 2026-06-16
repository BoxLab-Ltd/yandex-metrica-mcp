import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { runBytime } from '../../api/reporting.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import { errorResult, formatBytimeResponse, toToolResult } from '../format.js'
import { DEFAULT_DATE1, DEFAULT_DATE2, timeseriesInputShape } from './shared.js'

export function registerRunTimeseries(
    server: McpServer,
    ctx: ToolContext,
): void {
    server.registerTool(
        'run_timeseries',
        {
            title: 'Metrica metrics over time',
            description:
                'Return metrics split into a time series (/stat/v1/data/bytime): each metric comes back ' +
                'as an array of values, one per interval (day/week/month/…) over the date range. Use for ' +
                'trends and charts. Optionally group by dimensions (topKeys rows). Read-only.',
            inputSchema: timeseriesInputShape,
            annotations: {
                title: 'Metrica metrics over time',
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                const dimensions = args.dimensions ?? []
                const group = args.group ?? 'day'
                const resp = await runBytime(ctx.client, {
                    ids: counterId,
                    metrics: args.metrics,
                    dimensions: args.dimensions,
                    date1: args.date1 ?? DEFAULT_DATE1,
                    date2: args.date2 ?? DEFAULT_DATE2,
                    group,
                    filters: args.filters,
                    accuracy: args.accuracy,
                    timezone: args.timezone,
                    includeUndefined: args.includeUndefined,
                    topKeys: args.topKeys,
                })
                return toToolResult(
                    formatBytimeResponse(
                        resp,
                        dimensions,
                        args.metrics,
                        group,
                        args.fullResponse ?? false,
                    ),
                )
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
