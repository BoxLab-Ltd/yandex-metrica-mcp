import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    ATTRIBUTION_VALUES,
    DEFAULT_ATTRIBUTION,
    DIMENSIONS,
    GOAL_METRIC_TEMPLATES,
    LOGS_FIELDS,
    METRICS,
} from '../../api/catalog.js'
import { listCounters } from '../../api/metadata.js'
import type { ToolContext } from '../context.js'
import { errorResult, toToolResult } from '../format.js'

export function registerGetMetadata(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
        'get_metadata',
        {
            title: 'Get Metrica metadata',
            description:
                'Discovery tool. Lists the counters available to your token plus a curated catalog of common ' +
                'dimensions and metrics (Metrica has no enumeration API), attribution options and Logs API fields. ' +
                'Call this before run_report or logs_request to use real field names and to find a counterId. For a ' +
                "counter's own goals, segments, filters or grants, use describe_counter. Read-only.",
            inputSchema: {},
            annotations: {
                title: 'Get Metrica metadata',
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async () => {
            try {
                const counters = await listCounters(ctx.client)
                const counterSummaries = counters.map(c => ({
                    id: c.id,
                    name: c.name ?? null,
                    site: c.site2?.site ?? c.site ?? null,
                    status: c.status ?? null,
                }))

                const logField = (source: 'visits' | 'hits') =>
                    LOGS_FIELDS.filter(f => f.source === source).map(f => ({
                        id: f.id,
                        title: f.title,
                        personal: f.personal ?? false,
                    }))

                const structured: Record<string, unknown> = {
                    counters: counterSummaries,
                    logs_fields: {
                        visits: logField('visits'),
                        hits: logField('hits'),
                        note:
                            'Fields for the Logs API (logs_request). Match ids to the source: visits→ym:s:, ' +
                            'hits→ym:pv:; do not mix. Curated subset — full lists at ' +
                            'yandex.com/dev/metrika/en/logs/fields. personal=true fields carry visitor personal data.',
                    },
                    catalog: {
                        dimensions: DIMENSIONS,
                        metrics: METRICS,
                        goal_metric_templates: GOAL_METRIC_TEMPLATES,
                        attribution_values: ATTRIBUTION_VALUES,
                        default_attribution: DEFAULT_ATTRIBUTION,
                        notes: [
                            'A single query must not mix ym:s: (visits) and ym:pv: (hits) namespaces.',
                            'For per-goal metrics, replace <goalId> in goal_metric_templates with a real goal id from describe_counter (include=["goals"]).',
                            'Source dimensions/metrics use the lastsign (last significant) attribution by default.',
                            'E-commerce revenue ids contain a <currency> token: the API resolves it to the counter currency, or substitute an ISO code (e.g. ym:s:ecommerceRUBConvertedRevenue). Requires e-commerce enabled on the counter.',
                            'When analyzing raw traffic (visits/users), also request ym:s:robotPercentage: bots are counted in visits and a single bot spike can invert a breakdown.',
                        ],
                    },
                }

                return toToolResult(structured)
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
