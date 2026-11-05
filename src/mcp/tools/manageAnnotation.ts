import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
    createAnnotation,
    deleteAnnotation,
    getAnnotation,
    updateAnnotation,
    type AnnotationInput,
} from '../../api/annotations.js'
import type { Annotation } from '../../api/schemas.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import { errorResult, toToolResult } from '../format.js'
import { confirmToken, counterLabel, prepareWrite } from './write.js'

const TOOL = 'manage_annotation'

export const manageAnnotationInputShape = {
    counterId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            'Yandex Metrica counter id. Optional if YANDEX_METRIKA_COUNTER_ID is configured.',
        ),
    action: z
        .enum(['create', 'update', 'delete'])
        .describe('create a new annotation, or update / delete one by id.'),
    id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            'Annotation id, required for update and delete. List ids with describe_counter include=["annotations"].',
        ),
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
            'Date the note is pinned to, YYYY-MM-DD. Required for create.',
        ),
    time: z
        .string()
        .regex(/^\d{2}:\d{2}(:\d{2})?$/)
        .optional()
        .describe('Optional time of day, HH:MM or HH:MM:SS.'),
    title: z
        .string()
        .min(1)
        .max(255)
        .optional()
        .describe(
            'Short title shown on the chart, e.g. "Release 2.4". Required for create.',
        ),
    message: z
        .string()
        .max(1023)
        .optional()
        .describe('Optional longer description.'),
    group: z
        .enum(['A', 'B', 'C', 'D', 'E'])
        .optional()
        .describe('Colour group A–E, e.g. one per kind of event. Default A.'),
    confirmToken,
}

type Args = z.infer<z.ZodObject<typeof manageAnnotationInputShape>>

function describeNote(a: Pick<Annotation, 'date' | 'title'>): string {
    return `"${a.title ?? ''}" on ${a.date}`
}

function payload(args: Args, base?: Annotation): AnnotationInput {
    const pick = <K extends keyof AnnotationInput>(k: K) =>
        (args[k] ?? base?.[k]) as AnnotationInput[K]
    // The docs call group optional, but Metrica rejects a create without it (400 "must not be null").
    const out: AnnotationInput = {
        date: pick('date'),
        title: pick('title'),
        group: pick('group') ?? 'A',
    }
    for (const k of ['time', 'message'] as const) {
        const v = pick(k)
        if (v !== undefined) out[k] = v
    }
    return out
}

export function registerManageAnnotation(
    server: McpServer,
    ctx: ToolContext,
): void {
    server.registerTool(
        TOOL,
        {
            title: 'Create, update or delete a chart annotation',
            description:
                "Pin a note to a date on the counter's charts (a release, campaign start, outage), or change or " +
                'delete one. Writes to the counter: the user confirms every change. Needs "edit" access to the ' +
                'counter. List existing annotations with describe_counter include=["annotations"].',
            inputSchema: manageAnnotationInputShape,
            annotations: {
                title: 'Manage chart annotation',
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                if (args.action === 'create' && (!args.date || !args.title)) {
                    throw new Error('create needs both date and title.')
                }
                if (args.action !== 'create' && args.id === undefined) {
                    throw new Error(`${args.action} needs the annotation id.`)
                }
                const { write, counter } = await prepareWrite(ctx, counterId)
                const where = counterLabel(counter)

                const existing =
                    args.action === 'create'
                        ? undefined
                        : await getAnnotation(ctx.client, counterId, args.id!)
                const body =
                    args.action === 'delete'
                        ? undefined
                        : payload(args, existing)

                const summary =
                    args.action === 'create'
                        ? `Create annotation ${describeNote(body!)} in ${where}.`
                        : args.action === 'update'
                          ? `Update annotation ${args.id} in ${where}: ${describeNote(existing!)} -> ${describeNote(body!)}.`
                          : `Delete annotation ${args.id} ${describeNote(existing!)} from ${where}.`

                const decision = await write.confirmer.confirm(
                    {
                        tool: TOOL,
                        summary,
                        request: {
                            counterId,
                            action: args.action,
                            id: args.id,
                            chart_annotation: body,
                        },
                    },
                    args.confirmToken,
                )
                if (!decision.confirmed) return decision.result

                if (args.action === 'create') {
                    const created = await createAnnotation(
                        ctx.client,
                        counterId,
                        body!,
                    )
                    return toToolResult({
                        done: true,
                        summary,
                        annotation: created,
                    })
                }
                if (args.action === 'update') {
                    const updated = await updateAnnotation(
                        ctx.client,
                        counterId,
                        args.id!,
                        body!,
                    )
                    return toToolResult({
                        done: true,
                        summary,
                        annotation: updated,
                    })
                }
                await deleteAnnotation(ctx.client, counterId, args.id!)
                return toToolResult({ done: true, summary })
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
