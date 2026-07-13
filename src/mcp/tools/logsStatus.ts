import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getLogRequest, listLogRequests } from '../../api/logs.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import {
    errorResult,
    formatLogRequest,
    formatLogRequestList,
    toToolResult,
} from '../format.js'
import { logsStatusInputShape } from './shared.js'

export function registerLogsStatus(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
        'logs_status',
        {
            title: 'Check Metrica log requests',
            description:
                'Inspect a Logs API request by request_id (status, parts, size, next step), or omit request_id ' +
                "to list all of the counter's log requests and current storage-quota usage. Poll this after " +
                'logs_request until status="processed". Read-only.',
            inputSchema: logsStatusInputShape,
            annotations: {
                title: 'Check Metrica log requests',
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                if (args.requestId !== undefined) {
                    const req = await getLogRequest(
                        ctx.client,
                        counterId,
                        args.requestId,
                    )
                    return toToolResult(formatLogRequest(req))
                }
                const reqs = await listLogRequests(ctx.client, counterId)
                return toToolResult(formatLogRequestList(reqs))
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
