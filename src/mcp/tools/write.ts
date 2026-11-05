import { assertWriteAccess, YandexApiError } from '@boxlab/yandex-mcp-core'
import { z } from 'zod'
import { getCounter } from '../../api/metadata.js'
import type { Counter } from '../../api/schemas.js'
import type { ToolContext, WriteContext } from '../context.js'

const WRITABLE_PERMISSIONS = ['own', 'edit']

export const confirmToken = z
    .string()
    .optional()
    .describe(
        'Only when a previous call returned confirmed:false with a confirm_token AND the user approved that ' +
            'summary: pass the token to apply the change. Never set it on your own.',
    )

// Runs before the user is asked anything, so they never approve a change that cannot succeed.
export async function prepareWrite(
    ctx: ToolContext,
    counterId: number,
): Promise<{ write: WriteContext; counter: Counter }> {
    const write = ctx.write
    if (!write) {
        throw new Error(
            'Write tools are disabled. Set YANDEX_METRIKA_ENABLE_WRITE=1 to enable them.',
        )
    }
    await assertWriteAccess(write.auth, write.provider)
    const counter = await getCounter(ctx.client, counterId)
    const permission = counter.permission ?? 'unknown'
    if (!WRITABLE_PERMISSIONS.includes(permission)) {
        throw new Error(
            `Your account has "${permission}" access to counter ${counterId}; changing it needs "edit" or "own". ` +
                "Ask the counter's owner for edit access.",
        )
    }
    return { write, counter }
}

export function counterLabel(counter: Counter): string {
    return counter.name
        ? `counter ${counter.id} "${counter.name}"`
        : `counter ${counter.id}`
}

/** Run the mutation itself; a timeout or 5xx leaves its outcome unknown, so say how to check before retrying. */
export async function applying<T>(
    fn: () => Promise<T>,
    check: string,
): Promise<T> {
    try {
        return await fn()
    } catch (err) {
        if (
            err instanceof YandexApiError &&
            (err.status === 0 || err.status >= 500)
        ) {
            throw new Error(
                `${err.message}. It was not retried and may or may not have been applied — ${check} before trying again.`,
                { cause: err },
            )
        }
        throw err
    }
}
