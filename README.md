# yandex-metrica-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for
**Yandex Metrica**. It lets an AI agent query your web-analytics data — traffic,
sources, landing pages, conversions, geography, devices and trends — through a
small set of flexible, read-only tools.

> Status: early development (v0.1, work in progress). General-purpose: SEO is
> one of many use cases, not the focus.

## Why

There is no official Yandex Metrica MCP server, and existing community ones are
mostly thin, unmaintained, or dump raw data straight into the model's context.
This server aims to be the well-engineered, well-maintained, open option:
flexible report tools, strict token/context discipline, read-only by default.

## Features (v0.1)

- `run_report` — flexible wrapper over the Reporting API (`/stat/v1/data`).
- `run_comparison` — compare two periods with absolute and percentage deltas.
- `run_drilldown` — drill down through a dimension tree.
- `run_timeseries` — metrics split into a time series (`/bytime`) for trends.
- `get_metadata` — discover available counters, goals, and common
  dimensions/metrics so the model queries with real field names.
- Built-in context control: field selection on by default, low default row
  limits, and sampling/quota surfaced back to the model.

Planned for later: Logs API (raw row-level export → local SQL), Streamable HTTP
transport, write tools (behind an explicit flag).

## Requirements

- Node.js >= 18
- Yandex Metrica credentials with the `metrika:read` scope (see
  **Authentication**). Whoever the credentials belong to must have access to the
  counters you query.

## Authentication

**Recommended: interactive login.** No app registration needed — the server
ships a built-in public OAuth client. Run once:

```bash
yandex-metrica-mcp auth     # or, in dev: bun run auth
```

It opens a Yandex consent page; after you approve, Yandex shows a code that you
paste back into the terminal. The token is cached at
`~/.config/yandex-metrica-mcp/token.json` (mode 0600) and is valid for ~1 year;
re-run `auth` when it expires. The login uses authorization-code + PKCE, so **no
client secret is stored anywhere**. A cached login takes precedence over
`YANDEX_METRIKA_TOKEN`.

**Alternative: static token.** Get a token for an app with the `metrika:read`
scope at <https://oauth.yandex.ru> and pass it as `YANDEX_METRIKA_TOKEN` — handy
for CI or non-interactive use.

**Own OAuth app (optional).** To use your own app instead of the built-in one,
set `YANDEX_OAUTH_CLIENT_ID`; add `YANDEX_OAUTH_CLIENT_SECRET` to also enable
automatic token refresh.

## Usage

Add the server to your MCP client (e.g. Claude Desktop) configuration:

```json
{
    "mcpServers": {
        "yandex-metrica": {
            "command": "npx",
            "args": ["-y", "yandex-metrica-mcp"],
            "env": {
                "YANDEX_METRIKA_TOKEN": "your-oauth-token",
                "YANDEX_METRIKA_COUNTER_ID": "12345678"
            }
        }
    }
}
```

See [`.env.example`](./.env.example) for all configuration options. The published
package runs on Node (so `npx`/MCP clients work out of the box); local
development uses [Bun](https://bun.sh).

## Examples

Once connected, an agent can answer questions like:

- “How many visits and users did counter 12345678 get last week, split by traffic
  source?” → `run_report` with `metrics: ["ym:s:visits","ym:s:users"]`,
  `dimensions: ["ym:s:lastsignTrafficSource"]`.
- “Compare this week's organic conversions to last week's.” → `run_comparison`
  (server returns A, B, and the deltas).
- “Which operating systems do my visitors use? Let me drill into Windows
  versions.” → `run_drilldown`, then again with `parentId`.
- “What counters and goals can I query?” → `get_metadata`.

## Development

This project is Bun-first:

```bash
bun install
bun run dev        # run from source with hot reload
bun run typecheck  # tsc --noEmit
bun run lint       # eslint
bun test           # bun's test runner
bun run build      # emit dist/ with tsc (Node-compatible)
```

## License

[MIT](./LICENSE) © boxlab
