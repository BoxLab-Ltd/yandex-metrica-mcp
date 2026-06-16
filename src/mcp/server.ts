import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { MetricaClient } from '../api/client.js'
import { resolveTokenProvider } from '../auth/resolve.js'
import {
    loadConfig,
    SERVER_NAME,
    SERVER_VERSION,
    type Config,
} from '../config.js'
import type { ToolContext } from './context.js'
import { registerGetMetadata } from './tools/getMetadata.js'
import { registerRunComparison } from './tools/runComparison.js'
import { registerRunDrilldown } from './tools/runDrilldown.js'
import { registerRunReport } from './tools/runReport.js'
import { registerRunTimeseries } from './tools/runTimeseries.js'

/**
 * Build a fully configured MCP server: the Metrica API client, the tool
 * context, and all registered tools. Transport is wired up by the caller.
 */
export function createServer(config: Config = loadConfig()): McpServer {
    const { provider, mode } = resolveTokenProvider(config)
    // stderr only — stdout carries the MCP protocol on the stdio transport.
    console.error(`yandex-metrica-mcp: auth source = ${mode}`)

    const client = new MetricaClient({
        baseUrl: config.baseUrl,
        getToken: () => provider.getAccessToken(),
        onUnauthorized: rejected => provider.forceRefresh(rejected),
        canRefresh: () => provider.canRefresh(),
        userAgent: config.userAgent,
        maxConcurrency: config.maxConcurrency,
        requestTimeoutMs: config.requestTimeoutMs,
        lang: config.lang,
    })

    const ctx: ToolContext = { client, config }
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })

    registerGetMetadata(server, ctx)
    registerRunReport(server, ctx)
    registerRunComparison(server, ctx)
    registerRunDrilldown(server, ctx)
    registerRunTimeseries(server, ctx)

    return server
}
