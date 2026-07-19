import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    getCounter,
    listFilters,
    listGoals,
    listGrants,
    listOperations,
    listSegments,
} from '../../api/metadata.js'
import { resolveCounterId, type ToolContext } from '../context.js'
import { errorResult, toToolResult } from '../format.js'
import { describeCounterInputShape } from './shared.js'

const DEFAULT_INCLUDE = ['settings', 'goals'] as const

export function registerDescribeCounter(
    server: McpServer,
    ctx: ToolContext,
): void {
    server.registerTool(
        'describe_counter',
        {
            title: 'Describe Metrica counter',
            description:
                "Read a single counter's configuration — settings, goals, segments, filters, operations and " +
                'access grants — choosing sections with `include`. The goals section returns the goal ids needed ' +
                'to build conversion metrics (ym:s:goal<id>reaches / conversionRate) in run_report, so call this ' +
                "with include=[\"goals\"] before any conversion question. To list the account's counters, use " +
                'get_metadata. Read-only.',
            inputSchema: describeCounterInputShape,
            annotations: {
                title: 'Describe Metrica counter',
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const counterId = resolveCounterId(args.counterId, ctx.config)
                const include = args.include ?? [...DEFAULT_INCLUDE]
                const full = args.fullResponse ?? false
                const want = (section: string) =>
                    (include as readonly string[]).includes(section)

                const [settings, goals, segments, filters, operations, grants] =
                    await Promise.all([
                        want('settings')
                            ? getCounter(ctx.client, counterId)
                            : null,
                        want('goals')
                            ? listGoals(ctx.client, counterId)
                            : null,
                        want('segments')
                            ? listSegments(ctx.client, counterId)
                            : null,
                        want('filters')
                            ? listFilters(ctx.client, counterId)
                            : null,
                        want('operations')
                            ? listOperations(ctx.client, counterId)
                            : null,
                        want('grants')
                            ? listGrants(ctx.client, counterId)
                            : null,
                    ])

                const out: Record<string, unknown> = { counterId }
                if (settings) {
                    out.settings = full
                        ? settings
                        : {
                              id: settings.id,
                              name: settings.name ?? null,
                              site: settings.site2?.site ?? settings.site ?? null,
                              status: settings.status ?? null,
                              owner_login: settings.owner_login ?? null,
                              permission: settings.permission ?? null,
                          }
                }
                if (goals) {
                    out.goals = full
                        ? goals
                        : goals.map(g => ({
                              id: g.id,
                              name: g.name ?? null,
                              type: g.type ?? null,
                              default_price: g.default_price ?? null,
                          }))
                }
                if (segments) {
                    out.segments = full
                        ? segments
                        : segments.map(s => ({
                              segment_id: s.segment_id,
                              name: s.name ?? null,
                              expression: s.expression ?? null,
                              status: s.status ?? null,
                          }))
                }
                if (filters) {
                    out.filters = full
                        ? filters
                        : filters.map(f => ({
                              id: f.id,
                              action: f.action ?? null,
                              attr: f.attr ?? null,
                              type: f.type ?? null,
                              value: f.value ?? null,
                              status: f.status ?? null,
                          }))
                }
                if (operations) {
                    out.operations = full
                        ? operations
                        : operations.map(o => ({
                              id: o.id,
                              action: o.action ?? null,
                              attr: o.attr ?? null,
                              value: o.value ?? null,
                              status: o.status ?? null,
                          }))
                }
                if (grants) {
                    out.grants = full
                        ? grants
                        : grants.map(g => ({
                              user_login: g.user_login ?? null,
                              perm: g.perm ?? null,
                              created_at: g.created_at ?? null,
                              comment: g.comment ?? null,
                          }))
                }

                return toToolResult(out)
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
