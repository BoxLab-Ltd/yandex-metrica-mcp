import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { runComparison } from '../../api/reporting.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import {
    errorResult,
    formatComparisonResponse,
    toToolResult,
} from '../format.js'
import { comparisonInputShape } from './shared.js'

// Default "this period vs the period before" window when segments are omitted.
const DEFAULT_A1 = '14daysAgo'
const DEFAULT_A2 = '8daysAgo'
const DEFAULT_B1 = '7daysAgo'
const DEFAULT_B2 = 'yesterday'

export function registerRunComparison(
    server: McpServer,
    ctx: ToolContext,
): void {
    server.registerTool(
        'run_comparison',
        {
            title: 'Compare Metrica segments',
            description:
                'Compare two segments/periods (A vs B) for the same metrics and dimensions ' +
                '(/stat/v1/data/comparison). Returns per-metric values for A and B plus the absolute ' +
                'and percentage delta, computed server-side. Defaults to last 7 days vs the prior 7 days. ' +
                'Read-only.',
            inputSchema: comparisonInputShape,
            annotations: {
                title: 'Compare Metrica segments',
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                const dimensions = args.dimensions ?? []
                const resp = await runComparison(ctx.client, {
                    ids: counterId,
                    metrics: args.metrics,
                    dimensions: args.dimensions,
                    date1A: args.date1A ?? DEFAULT_A1,
                    date2A: args.date2A ?? DEFAULT_A2,
                    filtersA: args.filtersA,
                    date1B: args.date1B ?? DEFAULT_B1,
                    date2B: args.date2B ?? DEFAULT_B2,
                    filtersB: args.filtersB,
                    sort: args.sort,
                    limit: args.limit ?? ctx.config.defaultRowLimit,
                    offset: args.offset,
                    accuracy: args.accuracy,
                    timezone: args.timezone,
                    preset: args.preset,
                    includeUndefined: args.includeUndefined,
                })
                return toToolResult(
                    formatComparisonResponse(
                        resp,
                        dimensions,
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
