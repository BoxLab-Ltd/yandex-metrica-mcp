#!/usr/bin/env node
import {
    parseTransportOptions,
    runAuthCli,
    serveHttp,
} from '@boxlab/yandex-mcp-core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadAuthConfig } from './config.js'
import { createServerFactory } from './mcp/server.js'

const DEFAULT_HTTP_PORT = 7801

async function main(): Promise<void> {
    if (process.argv[2] === 'auth') {
        await runAuthCli(loadAuthConfig(process.env), process.argv)
        return
    }

    const transport = parseTransportOptions(process.argv, process.env, {
        port: DEFAULT_HTTP_PORT,
    })
    const createSession = createServerFactory()
    if (transport.mode === 'http') {
        const http = await serveHttp(createSession, transport)
        console.error(`yandex-metrica-mcp: serving MCP at ${http.url}`)
        const stop = () => void http.close().then(() => process.exit(0))
        process.once('SIGINT', stop)
        process.once('SIGTERM', stop)
        return
    }
    await createSession().connect(new StdioServerTransport())
    // The process now stays alive serving MCP requests over stdio.
}

main().catch((err: unknown) => {
    // stdout carries the MCP protocol on stdio transport — log only to stderr.
    console.error(
        'yandex-metrica-mcp failed to start:',
        err instanceof Error ? err.message : err,
    )
    process.exit(1)
})
