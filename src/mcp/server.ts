import {
    registerLoginTools,
    resolveTokenProvider,
    YandexClient,
} from '@boxlab/yandex-mcp-core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    loadAuthConfig,
    loadConfig,
    SERVER_NAME,
    SERVER_VERSION,
    type Config,
} from '../config.js'
import type { ToolContext } from './context.js'
import { registerDescribeCounter } from './tools/describeCounter.js'
import { registerGetMetadata } from './tools/getMetadata.js'
import { registerLogsClean } from './tools/logsClean.js'
import { registerLogsDownload } from './tools/logsDownload.js'
import { registerLogsRequest } from './tools/logsRequest.js'
import { registerLogsStatus } from './tools/logsStatus.js'
import { registerRunComparison } from './tools/runComparison.js'
import { registerRunDrilldown } from './tools/runDrilldown.js'
import { registerRunReport } from './tools/runReport.js'
import { registerRunTimeseries } from './tools/runTimeseries.js'

/**
 * Build a fully configured MCP server: the Metrica API client, the tool
 * context, and all registered tools. Transport is wired up by the caller.
 */
export function createServer(config: Config = loadConfig()): McpServer {
    const authConfig = loadAuthConfig()
    const { provider, store, mode } = resolveTokenProvider(authConfig)
    // stderr only — stdout carries the MCP protocol on the stdio transport.
    console.error(`yandex-metrica-mcp: auth source = ${mode}`)

    const client = new YandexClient({
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

    registerLoginTools(server, { config: authConfig, provider, store })
    registerGetMetadata(server, ctx)
    registerDescribeCounter(server, ctx)
    registerRunReport(server, ctx)
    registerRunComparison(server, ctx)
    registerRunDrilldown(server, ctx)
    registerRunTimeseries(server, ctx)
    registerLogsRequest(server, ctx)
    registerLogsStatus(server, ctx)
    registerLogsDownload(server, ctx)
    registerLogsClean(server, ctx)

    return server
}
