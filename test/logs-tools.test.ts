import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it, mock } from 'bun:test'
import { MetricaClient } from '../src/api/client.js'
import { loadConfig } from '../src/config.js'
import type { ToolContext } from '../src/mcp/context.js'
import { registerLogsRequest } from '../src/mcp/tools/logsRequest.js'
import { registerLogsStatus } from '../src/mcp/tools/logsStatus.js'

type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>
type Register = (server: McpServer, ctx: ToolContext) => void

function capture(register: Register, ctx: ToolContext): Handler {
    let handler: Handler | undefined
    const fake = {
        registerTool: (_name: string, _def: unknown, h: Handler) => {
            handler = h
        },
    }
    register(fake as unknown as McpServer, ctx)
    if (!handler) throw new Error('no tool registered')
    return handler
}

function ctxWith(fetchImpl: typeof fetch): ToolContext {
    const client = new MetricaClient({
        baseUrl: 'https://api-metrika.yandex.net',
        getToken: async () => 'tok',
        userAgent: 'test/1.0',
        maxConcurrency: 3,
        requestTimeoutMs: 1000,
        fetchImpl,
        sleep: async () => {},
    })
    return { client, config: loadConfig({}), onLogin: () => {} }
}

const structured = (res: CallToolResult) =>
    res.structuredContent as Record<string, unknown>

describe('logs_status tool', () => {
    it('formats a request, exposing ready + part count', async () => {
        const fetchImpl = mock(
            async () =>
                new Response(
                    JSON.stringify({
                        log_request: {
                            request_id: 42,
                            status: 'processed',
                            source: 'visits',
                            parts: [{ part_number: 0 }, { part_number: 1 }],
                        },
                    }),
                    {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    },
                ),
        ) as unknown as typeof fetch

        const handler = capture(registerLogsStatus, ctxWith(fetchImpl))
        const res = await handler({ counterId: 111, requestId: 42 })

        expect(res.isError).toBeFalsy()
        expect(structured(res).request_id).toBe(42)
        expect(structured(res).ready).toBe(true)
        expect(structured(res).parts).toBe(2)
    })
})

describe('logs_request tool', () => {
    it('surfaces a prefix mismatch as an error result, never hitting the API', async () => {
        let called = false
        const fetchImpl = mock(async () => {
            called = true
            return new Response('{}')
        }) as unknown as typeof fetch

        const handler = capture(registerLogsRequest, ctxWith(fetchImpl))
        const res = await handler({
            counterId: 111,
            source: 'visits',
            fields: ['ym:pv:URL'],
            date1: '2020-01-01',
            date2: '2020-01-31',
        })

        expect(res.isError).toBe(true)
        expect(called).toBe(false)
        expect((res.content[0] as { text: string }).text).toContain('ym:pv:')
    })
})
