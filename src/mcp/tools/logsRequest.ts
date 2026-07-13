import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    assertFieldsMatchSource,
    assertValidDateRange,
    createLogRequest,
    evaluateLogRequest,
    getLogRequest,
    isProcessed,
    isTerminal,
} from '../../api/logs.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import { errorResult, formatLogRequest, toToolResult } from '../format.js'
import { logsRequestInputShape } from './shared.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const POLL_INTERVAL_MS = 5000

export function registerLogsRequest(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
        'logs_request',
        {
            title: 'Request Metrica raw logs',
            description:
                'Create a Yandex Metrica Logs API request for RAW, un-sampled rows (source="visits" sessions or ' +
                '"hits" events) over a date range. Checks feasibility, then queues preparation (takes minutes). ' +
                'Returns a request_id to poll with logs_status; then logs_download, then logs_clean. Discover ' +
                'field ids with get_metadata. Not read-only: preparing data consumes the counter storage quota.',
            inputSchema: logsRequestInputShape,
            annotations: {
                title: 'Request Metrica raw logs',
                readOnlyHint: false,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                const source = args.source
                assertFieldsMatchSource(source, args.fields)
                assertValidDateRange(args.date1, args.date2)

                const evaluation = await evaluateLogRequest(
                    ctx.client,
                    counterId,
                    {
                        date1: args.date1,
                        date2: args.date2,
                        source,
                        fields: args.fields,
                    },
                )
                if (!evaluation.possible) {
                    const days = evaluation.max_possible_day_quantity
                    return toToolResult({
                        created: false,
                        possible: false,
                        max_possible_day_quantity: days ?? null,
                        note:
                            'The request is not feasible right now — usually the date range is too large for the ' +
                            'remaining quota. Narrow the range' +
                            (days ? ` (to ~${days} days)` : '') +
                            ', request fewer fields, or free quota by cleaning finished requests (see logs_status).',
                    })
                }

                let req = await createLogRequest(ctx.client, counterId, {
                    date1: args.date1,
                    date2: args.date2,
                    source,
                    fields: args.fields,
                    attribution: args.attribution,
                })

                const waitSeconds = args.waitSeconds ?? 0
                if (waitSeconds > 0) {
                    const deadline = Date.now() + waitSeconds * 1000
                    while (
                        !isProcessed(req.status) &&
                        !isTerminal(req.status) &&
                        Date.now() + POLL_INTERVAL_MS <= deadline
                    ) {
                        await sleep(POLL_INTERVAL_MS)
                        req = await getLogRequest(
                            ctx.client,
                            counterId,
                            req.request_id,
                        )
                    }
                }

                return toToolResult(formatLogRequest(req))
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
