import { createHash } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
    uploadExpenses,
    validateExpensesCsv,
    type ExpensesPreview,
} from '../../api/expenses.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import { errorResult, toToolResult } from '../format.js'
import { confirmToken, counterLabel, prepareWrite } from './write.js'

const TOOL = 'upload_expenses'
const MAX_CSV_CHARS = 2_000_000

export const uploadExpensesInputShape = {
    counterId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            'Yandex Metrica counter id. Optional if YANDEX_METRIKA_COUNTER_ID is configured.',
        ),
    csv: z
        .string()
        .min(1)
        .max(MAX_CSV_CHARS)
        .describe(
            'Expenses as CSV with a header row. Required: Date (YYYY-MM-DD or YYYY-MM-DD/YYYY-MM-DD), ' +
                'UTMSource or TrafficSource, Expenses (dot decimal). Optional: TrafficSourceDetail, UTMMedium, ' +
                'UTMCampaign, UTMTerm, UTMContent, Currency (ISO 4217), Clicks. UTM values are case-sensitive.',
        ),
    provider: z
        .string()
        .max(255)
        .optional()
        .describe(
            'Name of the service the data comes from. Default "default".',
        ),
    comment: z
        .string()
        .max(255)
        .optional()
        .describe('Comment stored with the upload, e.g. "VK Ads, October".'),
    dryRun: z
        .boolean()
        .optional()
        .describe(
            'true: only validate and summarise the CSV; nothing is sent and no confirmation is asked. ' +
                'Do this first and show the preview to the user.',
        ),
    confirmToken,
}

function summaryOf(preview: ExpensesPreview, where: string): string {
    const totals = Object.entries(preview.totals)
        .map(([cur, sum]) => `${sum} ${cur}`)
        .join(' + ')
    const lines = [
        `Upload ${preview.rows} expense row(s) for ${preview.dateFrom} … ${preview.dateTo}, total ${totals}, to ${where}.`,
        ...preview.warnings.map(w => `- ${w}`),
    ]
    return lines.join('\n')
}

export function registerUploadExpenses(
    server: McpServer,
    ctx: ToolContext,
): void {
    server.registerTool(
        TOOL,
        {
            title: 'Upload advertising expenses',
            description:
                'Import ad costs from a non-Yandex source (by UTM tags or traffic source) so Metrica can report ' +
                'cost and ROI. Validates the CSV first; dryRun:true returns the summary without sending anything. ' +
                'Writes to the counter: the user confirms the upload. Not for Yandex Direct (it arrives ' +
                'automatically). Uploads add up — sending the same rows again doubles them.',
            inputSchema: uploadExpensesInputShape,
            annotations: {
                title: 'Upload advertising expenses',
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                const checked = validateExpensesCsv(args.csv)
                if (!checked.ok) {
                    return toToolResult({
                        valid: false,
                        errors: checked.errors,
                        next: 'Fix these rows and validate again; nothing was sent.',
                    })
                }
                if (args.dryRun) {
                    return toToolResult({
                        valid: true,
                        dry_run: true,
                        counterId,
                        preview: checked.preview,
                        next: 'Nothing was sent. Show this preview to the user; upload only if they want it.',
                    })
                }

                const { write, counter } = await prepareWrite(ctx, counterId)
                const summary = summaryOf(
                    checked.preview,
                    counterLabel(counter),
                )
                const decision = await write.confirmer.confirm(
                    {
                        tool: TOOL,
                        summary,
                        request: {
                            counterId,
                            provider: args.provider,
                            comment: args.comment,
                            csv_sha256: createHash('sha256')
                                .update(args.csv)
                                .digest('hex'),
                        },
                    },
                    args.confirmToken,
                )
                if (!decision.confirmed) return decision.result

                const uploading = await uploadExpenses(
                    ctx.client,
                    counterId,
                    args.csv,
                    {
                        provider: args.provider,
                        comment: args.comment,
                    },
                )
                return toToolResult({
                    done: true,
                    summary,
                    uploading,
                    note: 'Metrica processes uploads asynchronously; costs appear in reports once status is PROCESSED.',
                })
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
