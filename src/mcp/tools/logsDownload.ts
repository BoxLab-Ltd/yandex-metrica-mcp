import { join } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { isPersonalLogField } from '../../api/catalog.js'
import {
    downloadLogSample,
    downloadLogToFile,
    getLogRequest,
    isProcessed,
} from '../../api/logs.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import {
    errorResult,
    formatLogDownload,
    formatLogRequest,
    formatLogSample,
    toToolResult,
} from '../format.js'
import {
    logsDownloadInputShape,
    LOGS_PREVIEW_ROWS,
    LOGS_SAMPLE_DEFAULT_ROWS,
} from './shared.js'

export function registerLogsDownload(
    server: McpServer,
    ctx: ToolContext,
): void {
    server.registerTool(
        'logs_download',
        {
            title: 'Download Metrica raw logs',
            description:
                'Download prepared log data for a request_id (must be status="processed"; check logs_status). ' +
                'Default mode "sample" returns up to maxRows parsed rows inline — cheap and bounded. Mode "file" ' +
                'streams the FULL export to a file and returns its path plus a small preview; the raw content ' +
                '(potentially millions of rows) is never loaded into context. Read-only.',
            inputSchema: logsDownloadInputShape,
            annotations: {
                title: 'Download Metrica raw logs',
                readOnlyHint: true,
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
                if (!isProcessed(req.status)) {
                    return toToolResult(formatLogRequest(req))
                }

                const containsPersonal = (req.fields ?? []).some(
                    isPersonalLogField,
                )

                if ((args.mode ?? 'sample') === 'file') {
                    const filePath =
                        args.outputPath ??
                        join(
                            ctx.config.logsOutputDir,
                            `metrica-logs-c${counterId}-r${req.request_id}.tsv`,
                        )
                    const result = await downloadLogToFile(
                        ctx.client,
                        counterId,
                        req.request_id,
                        req.parts?.length ?? 0,
                        filePath,
                        LOGS_PREVIEW_ROWS,
                    )
                    return toToolResult(
                        formatLogDownload(result, containsPersonal),
                    )
                }

                const sample = await downloadLogSample(
                    ctx.client,
                    counterId,
                    req.request_id,
                    args.maxRows ?? LOGS_SAMPLE_DEFAULT_ROWS,
                )
                return toToolResult(formatLogSample(sample, containsPersonal))
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
