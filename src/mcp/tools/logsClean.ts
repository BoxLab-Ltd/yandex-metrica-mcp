import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    cancelLogRequest,
    cleanLogRequest,
    getLogRequest,
    isInProgress,
    isProcessed,
} from '../../api/logs.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import { errorResult, formatLogRequest, toToolResult } from '../format.js'
import { logsCleanInputShape } from './shared.js'

export function registerLogsClean(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
        'logs_clean',
        {
            title: 'Clean or cancel a Metrica log request',
            description:
                'Free the counter storage quota by cleaning a finished (processed) log request, or cancel one ' +
                'still being prepared. Dispatches by current status. Destructive: cleaned data must be requested ' +
                'again to download later.',
            inputSchema: logsCleanInputShape,
            annotations: {
                title: 'Clean or cancel a Metrica log request',
                readOnlyHint: false,
                destructiveHint: true,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                const req = await getLogRequest(
                    ctx.client,
                    counterId,
                    args.requestId,
                )

                if (isInProgress(req.status)) {
                    const canceled = await cancelLogRequest(
                        ctx.client,
                        counterId,
                        req.request_id,
                    )
                    return toToolResult({
                        action: 'canceled',
                        ...formatLogRequest(canceled),
                    })
                }
                if (isProcessed(req.status)) {
                    const cleaned = await cleanLogRequest(
                        ctx.client,
                        counterId,
                        req.request_id,
                    )
                    return toToolResult({
                        action: 'cleaned',
                        ...formatLogRequest(cleaned),
                    })
                }
                return toToolResult({
                    action: 'noop',
                    ...formatLogRequest(req),
                })
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
