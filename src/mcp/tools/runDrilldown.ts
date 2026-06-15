import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { runDrilldown } from '../../api/reporting.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import {
    errorResult,
    formatDrilldownResponse,
    toToolResult,
} from '../format.js'
import { DEFAULT_DATE1, DEFAULT_DATE2, drilldownInputShape } from './shared.js'

export function registerRunDrilldown(
    server: McpServer,
    ctx: ToolContext,
): void {
    server.registerTool(
        'run_drilldown',
        {
            title: 'Drill down a Metrica report',
            description:
                'Return one level of a hierarchical (tree) report (/stat/v1/data/drilldown). Each row has ' +
                'an "expandable" flag; pass parentId with the path of dimension keys to expand deeper. ' +
                'Requires dimensions. Read-only.',
            inputSchema: drilldownInputShape,
            annotations: {
                title: 'Drill down a Metrica report',
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                const resp = await runDrilldown(ctx.client, {
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
                    parentId: args.parentId,
                })
                return toToolResult(
                    formatDrilldownResponse(
                        resp,
                        args.metrics,
                        args.fullResponse ?? false,
                    ),
                )
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
