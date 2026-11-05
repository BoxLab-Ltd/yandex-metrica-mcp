import {
    createMutationConfirmer,
    SessionTokenProvider,
    YandexClient,
    type TokenProvider,
} from '@boxlab/yandex-mcp-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, describe, expect, it } from 'bun:test'
import { validateExpensesCsv } from '../src/api/expenses.js'
import { loadAuthConfig, loadConfig } from '../src/config.js'
import type { ToolContext } from '../src/mcp/context.js'
import { createServer } from '../src/mcp/server.js'
import { registerManageAnnotation } from '../src/mcp/tools/manageAnnotation.js'
import { registerUploadExpenses } from '../src/mcp/tools/uploadExpenses.js'

const RW = 'metrika:read metrika:write'

interface Call {
    method: string
    url: URL
    body?: unknown
}

function api(permission = 'edit') {
    const calls: Call[] = []
    const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        const method = init?.method ?? 'GET'
        calls.push({ method, url, body: init?.body })
        const p = url.pathname
        if (p === '/management/v1/counter/7') {
            return json({ counter: { id: 7, name: 'Shop', permission } })
        }
        if (
            p === '/management/v1/counter/7/chart_annotation/5' &&
            method === 'GET'
        ) {
            return json({
                chart_annotation: {
                    id: 5,
                    date: '2026-10-01',
                    title: 'Old',
                    group: 'B',
                },
            })
        }
        if (p.includes('chart_annotation')) {
            const sent = init?.body ? JSON.parse(String(init.body)) : {}
            return json(
                method === 'DELETE'
                    ? { success: true }
                    : { chart_annotation: { id: 5, ...sent.chart_annotation } },
            )
        }
        if (p === '/management/v1/counter/7/expense/upload') {
            return json({
                uploading: { id: 99, status: 'UPLOADED', source_quantity: 2 },
            })
        }
        return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch
    return { calls, fetchImpl }
}

let closers: Array<() => Promise<void>> = []
afterEach(async () => {
    for (const c of closers) await c()
    closers = []
})

async function connect(opts: {
    fetchImpl: typeof fetch
    provider?: TokenProvider
}) {
    const server = new McpServer({ name: 't', version: '0' })
    const auth = loadAuthConfig({ YANDEX_METRIKA_ENABLE_WRITE: '1' })
    const ctx: ToolContext = {
        client: new YandexClient({
            baseUrl: 'https://api-metrika.yandex.net',
            getToken: async () => 'tok',
            userAgent: 't',
            maxConcurrency: 2,
            requestTimeoutMs: 1000,
            fetchImpl: opts.fetchImpl,
            sleep: async () => {},
        }),
        config: loadConfig({}),
        write: {
            auth,
            provider:
                opts.provider ??
                new SessionTokenProvider({
                    accessToken: 'tok',
                    expiresAt: 0,
                    scope: RW,
                }),
            confirmer: createMutationConfirmer(server),
        },
    }
    registerManageAnnotation(server, ctx)
    registerUploadExpenses(server, ctx)
    const client = new Client({ name: 'c', version: '0' })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    closers.push(() => client.close())
    return async (name: string, args: Record<string, unknown>) => {
        const r = (await client.callTool({
            name,
            arguments: args,
        })) as CallToolResult
        return {
            r,
            s: (r.structuredContent ?? {}) as Record<string, unknown>,
            text: (r.content[0] as { text: string }).text,
        }
    }
}

const writes = (calls: Call[]) => calls.filter(c => c.method !== 'GET')

describe('manage_annotation', () => {
    it('previews first, then creates only with the confirm token', async () => {
        const { calls, fetchImpl } = api()
        const call = await connect({ fetchImpl })
        const args = {
            counterId: 7,
            action: 'create',
            date: '2026-11-01',
            title: 'Release 2.4',
        }

        const first = await call('manage_annotation', args)
        expect(first.s.confirmed).toBe(false)
        expect(String(first.s.summary)).toContain('"Release 2.4" on 2026-11-01')
        expect(String(first.s.summary)).toContain('counter 7 "Shop"')
        expect(writes(calls)).toHaveLength(0)

        const done = await call('manage_annotation', {
            ...args,
            confirmToken: first.s.confirm_token,
        })
        expect(done.s.done).toBe(true)
        const post = writes(calls)
        expect(post).toHaveLength(1)
        expect(post[0]!.url.pathname).toBe(
            '/management/v1/counter/7/chart_annotations',
        )
        expect(JSON.parse(String(post[0]!.body))).toEqual({
            chart_annotation: {
                date: '2026-11-01',
                title: 'Release 2.4',
                group: 'A',
            },
        })
    })

    it('keeps unchanged fields on update and shows before -> after', async () => {
        const { calls, fetchImpl } = api()
        const call = await connect({ fetchImpl })
        const args = { counterId: 7, action: 'update', id: 5, title: 'New' }
        const first = await call('manage_annotation', args)
        expect(String(first.s.summary)).toContain(
            '"Old" on 2026-10-01 -> "New" on 2026-10-01',
        )
        await call('manage_annotation', {
            ...args,
            confirmToken: first.s.confirm_token,
        })
        const put = writes(calls)[0]!
        expect(put.method).toBe('PUT')
        expect(JSON.parse(String(put.body)).chart_annotation).toEqual({
            date: '2026-10-01',
            title: 'New',
            group: 'B',
        })
    })

    it('refuses a token for a different annotation', async () => {
        const { calls, fetchImpl } = api()
        const call = await connect({ fetchImpl })
        const first = await call('manage_annotation', {
            counterId: 7,
            action: 'delete',
            id: 5,
        })
        const other = await call('manage_annotation', {
            counterId: 7,
            action: 'create',
            date: '2026-11-02',
            title: 'X',
            confirmToken: first.s.confirm_token,
        })
        expect(other.s.confirmed).toBe(false)
        expect(writes(calls)).toHaveLength(0)
    })

    it('stops a read-only sign-in before asking anything', async () => {
        const { calls, fetchImpl } = api()
        const call = await connect({
            fetchImpl,
            provider: new SessionTokenProvider({
                accessToken: 'tok',
                expiresAt: 0,
                scope: 'metrika:read',
            }),
        })
        const r = await call('manage_annotation', {
            counterId: 7,
            action: 'create',
            date: '2026-11-01',
            title: 'X',
        })
        expect(r.r.isError).toBe(true)
        expect(r.text).toMatch(/login/)
        expect(calls).toHaveLength(0)
    })

    it('stops on view-only access to the counter', async () => {
        const { calls, fetchImpl } = api('view')
        const call = await connect({ fetchImpl })
        const r = await call('manage_annotation', {
            counterId: 7,
            action: 'create',
            date: '2026-11-01',
            title: 'X',
        })
        expect(r.r.isError).toBe(true)
        expect(r.text).toContain('"view" access')
        expect(writes(calls)).toHaveLength(0)
    })
})

const CSV =
    'Date,UTMSource,UTMCampaign,Expenses,Currency\n2026-10-01,vk,autumn,1200.50,RUB\n2026-10-02,vk,autumn,800,RUB\n'

describe('upload_expenses', () => {
    it('dry run summarises without touching the API', async () => {
        const { calls, fetchImpl } = api()
        const call = await connect({ fetchImpl })
        const r = await call('upload_expenses', {
            counterId: 7,
            csv: CSV,
            dryRun: true,
        })
        expect(r.s.dry_run).toBe(true)
        expect((r.s.preview as { totals: unknown }).totals).toEqual({
            RUB: 2000.5,
        })
        expect(calls).toHaveLength(0)
    })

    it('uploads a multipart file after confirmation', async () => {
        const { calls, fetchImpl } = api()
        const call = await connect({ fetchImpl })
        const args = {
            counterId: 7,
            csv: CSV,
            provider: 'vk',
            comment: 'October',
        }
        const first = await call('upload_expenses', args)
        expect(first.s.confirmed).toBe(false)
        expect(writes(calls)).toHaveLength(0)
        const done = await call('upload_expenses', {
            ...args,
            confirmToken: first.s.confirm_token,
        })
        expect(done.s.done).toBe(true)
        const post = writes(calls)[0]!
        expect(post.url.searchParams.get('provider')).toBe('vk')
        expect(post.url.searchParams.get('comment')).toBe('October')
        const file = (post.body as FormData).get('file') as File
        expect(await file.text()).toBe(CSV)
    })

    it('rejects a changed CSV under an old token', async () => {
        const { calls, fetchImpl } = api()
        const call = await connect({ fetchImpl })
        const first = await call('upload_expenses', { counterId: 7, csv: CSV })
        const again = await call('upload_expenses', {
            counterId: 7,
            csv: CSV.replace('800', '8000'),
            confirmToken: first.s.confirm_token,
        })
        expect(again.s.confirmed).toBe(false)
        expect(writes(calls)).toHaveLength(0)
    })
})

describe('validateExpensesCsv', () => {
    it('reports every format problem with its line', () => {
        const r = validateExpensesCsv(
            'Date,UTMSource,Expenses\n2026-13-01,vk,10\n2026-10-01,vk,10,5\n2026-10-01,,10\n2026-10-01,vk,"1,5"\n',
        )
        expect(r.ok).toBe(false)
        const errors = (r as { errors: string[] }).errors
        expect(errors[0]).toMatch(/^Line 2: Date/)
        expect(errors[1]).toMatch(/^Line 3: expected 3 values/)
        expect(errors[2]).toMatch(/^Line 4: needs a UTMSource/)
        expect(errors[3]).toMatch(/^Line 5: Expenses "1,5"/)
    })

    it('requires the documented columns', () => {
        const r = validateExpensesCsv('Date,Cost\n2026-10-01,5\n')
        expect((r as { errors: string[] }).errors.join(' ')).toMatch(
            /Unknown column\(s\): Cost/,
        )
    })

    it('warns about Yandex Direct rows and future dates, and accepts date ranges', () => {
        const r = validateExpensesCsv(
            'Date,UTMSource,Expenses\n2026-10-01/2026-10-07,yandex,100\n2026-12-01,vk,5\n',
            '2026-11-05',
        )
        expect(r.ok).toBe(true)
        const p = (
            r as {
                preview: {
                    dateFrom: string
                    dateTo: string
                    warnings: string[]
                    totals: object
                }
            }
        ).preview
        expect(p.dateFrom).toBe('2026-10-01')
        expect(p.dateTo).toBe('2026-12-01')
        expect(p.totals).toEqual({ 'counter currency': 105 })
        expect(p.warnings.join(' ')).toMatch(/Yandex Direct/)
        expect(p.warnings.join(' ')).toMatch(/1 row\(s\) are dated after today/)
    })
})

describe('write tools registration', () => {
    async function toolNames(env: NodeJS.ProcessEnv) {
        const server = createServer(loadConfig({}), {
            ...env,
            XDG_CONFIG_HOME: '/nonexistent',
        })
        const client = new Client({ name: 'c', version: '0' })
        const [a, b] = InMemoryTransport.createLinkedPair()
        await Promise.all([server.connect(a), client.connect(b)])
        closers.push(() => client.close())
        const { tools } = await client.listTools()
        return {
            names: tools.map(t => t.name),
            instructions: client.getInstructions() ?? '',
        }
    }

    it('exposes no write tools unless YANDEX_METRIKA_ENABLE_WRITE is on', async () => {
        const off = await toolNames({})
        expect(off.names).not.toContain('manage_annotation')
        expect(off.names).not.toContain('upload_expenses')
        expect(off.instructions).not.toContain('confirm_token')

        const on = await toolNames({ YANDEX_METRIKA_ENABLE_WRITE: '1' })
        expect(on.names).toContain('manage_annotation')
        expect(on.names).toContain('upload_expenses')
        expect(on.instructions).toContain('never confirm on their behalf')
    })
})
