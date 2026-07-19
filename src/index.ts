#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { runAuth } from './cli/auth.js'
import { createServer } from './mcp/server.js'

async function main(): Promise<void> {
    if (process.argv[2] === 'auth') {
        await runAuth(process.env, { oob: process.argv.includes('--oob') })
        return
    }

    const server = createServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
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
