# yandex-metrica-mcp

[![CI](https://github.com/BoxLab-Ltd/yandex-metrica-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/BoxLab-Ltd/yandex-metrica-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/yandex-metrica-mcp.svg)](https://www.npmjs.com/package/yandex-metrica-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Ask your Yandex Metrica analytics in plain language — from Claude, Cursor, or
any MCP client.**

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for
**Yandex Metrica**. It lets an AI agent query your web-analytics data — traffic,
sources, landing pages, conversions, geography, devices and trends — through a
small set of flexible, read-only tools.

> Read-only by design, no secrets stored in the package: interactive login uses
> a built-in public OAuth client with PKCE, and the server talks only to Yandex.

> Status: early development (v0.1, work in progress). General-purpose: SEO is
> one of many use cases, not the focus.

## Demo

Point an AI agent at your counter and ask about your traffic — the server queries
Yandex Metrica and hands back real, read-only data, no dashboards. Here the
`run_report` tool answers a “traffic sources, last 7 days” question against a live
counter:

![yandex-metrica-mcp querying live Yandex Metrica traffic sources, read-only](docs/demo.gif)

## Quickstart

**1. Add the server to your MCP client** (e.g. Claude Desktop) — no token
required up front; you log in interactively in step 2:

```json
{
    "mcpServers": {
        "yandex-metrica": {
            "command": "npx",
            "args": ["-y", "yandex-metrica-mcp"],
            "env": { "YANDEX_METRIKA_COUNTER_ID": "12345678" }
        }
    }
}
```

**2. Log in once — one command, no app registration, no secret stored:**

```bash
npx yandex-metrica-mcp auth
```

Approve access in the browser and you're done — the code is handed back
automatically over a local redirect, no copy-paste. The login uses
authorization-code + PKCE, so **no client secret ever touches your machine**; the
token is cached (mode 0600) and valid for ~1 year.

**3. Ask your agent** about traffic, sources, conversions, geography, devices, or
trends — see [Examples](#examples) for prompts.

Prefer a static token (CI / non-interactive) or your own OAuth app? See
[Authentication](#authentication).

### Or install as a Claude Code plugin

The repo doubles as a plugin marketplace, so you can install the server through
Claude Code's plugin system instead of the config above:

```bash
/plugin marketplace add BoxLab-Ltd/yandex-metrica-mcp
/plugin install yandex-metrica-mcp@boxlab
```

Then run `npx yandex-metrica-mcp auth` once to log in.

### Or install as a Claude Desktop extension (.mcpb)

For a one-click install with no JSON, download the `.mcpb` from the
[latest release](https://github.com/BoxLab-Ltd/yandex-metrica-mcp/releases/latest)
and open it with Claude Desktop (or drag it into Settings → Extensions). It asks
for an optional default counter id; then sign in from the chat with the `login`
tool (or run `npx yandex-metrica-mcp auth`).

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
- `get_metadata` — discover the counters on your account and a catalog of common
  dimensions/metrics (and Logs API fields) so the model queries with real names.
- `describe_counter` — read one counter's configuration (goals, segments,
  filters, operations, access grants) via an `include` selector. The goals
  section gives the goal ids needed for conversion metrics in `run_report`.
- `logs_request` / `logs_status` / `logs_download` / `logs_clean` — Logs API:
  export raw, un-sampled session (`visits`) or hit (`hits`) rows. Async lifecycle
  (request → poll → download → clean); `logs_download` returns a bounded sample
  inline by default, or streams the full export to a file — never dumping raw
  rows into the model's context.
- `login` / `submit_code` — sign in to Yandex Metrica from your MCP client, no
  terminal needed: `login` opens the browser and captures the code over a local
  redirect, or hands back a URL and takes the pasted code via `submit_code`.
- Built-in context control: field selection on by default, low default row
  limits, and sampling/quota surfaced back to the model.

Planned for later: Streamable HTTP transport, write tools (behind an explicit
flag).

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

It opens the Yandex consent page in your browser; after you approve, the code is
returned automatically over a loopback redirect (`http://127.0.0.1:53682`) — no
copy-paste. If that port is taken, it falls back to showing a code you paste in
(force that flow with `auth --oob`, or change the port with
`YANDEX_OAUTH_LOOPBACK_PORT`). The token is cached at
`~/.config/yandex-metrica-mcp/token.json` (mode 0600) and is valid for ~1 year;
re-run `auth` when it expires. The login uses authorization-code + PKCE, so **no
client secret is stored anywhere**. A cached login takes precedence over
`YANDEX_METRIKA_TOKEN`.

**From your MCP client (no terminal).** Not signed in yet? The server still
starts — ask your agent to run the `login` tool and it does the same browser
flow in-process (or returns a URL and takes the code via `submit_code`). Handy
for GUI clients like Claude Desktop, where there is no terminal to run `auth`. Get a token for an app with the `metrika:read`
scope at <https://oauth.yandex.ru> and pass it as `YANDEX_METRIKA_TOKEN` — handy
for CI or non-interactive use.

**Own OAuth app (optional).** To use your own app instead of the built-in one,
set `YANDEX_OAUTH_CLIENT_ID`; add `YANDEX_OAUTH_CLIENT_SECRET` to also enable
automatic token refresh.

## Configuration

The [Quickstart](#quickstart) covers the happy path. For all options — static
token, your own OAuth app, default counter, request tuning, language — see
[`.env.example`](./.env.example). The published package runs on Node (so
`npx`/MCP clients work out of the box); local development uses
[Bun](https://bun.sh).

## Examples

Once connected, an agent can answer questions like:

- “How many visits and users did counter 12345678 get last week, split by traffic
  source?” → `run_report` with `metrics: ["ym:s:visits","ym:s:users"]`,
  `dimensions: ["ym:s:lastsignTrafficSource"]`.
- “Compare this week's organic conversions to last week's.” → `run_comparison`
  (server returns A, B, and the deltas).
- “Which operating systems do my visitors use? Let me drill into Windows
  versions.” → `run_drilldown`, then again with `parentId`.
- “What counters do I have?” → `get_metadata`.
- “List this counter's goals, then show how the ‘Purchase’ goal converted last
  week.” → `describe_counter` (`include: ["goals"]`) for the goal id, then
  `run_report` with `ym:s:goal<id>conversionRate`.
- “Export last month's raw sessions with landing pages and referrers for offline
  analysis.” → `logs_request` (`source: "visits"`), poll `logs_status`, then
  `logs_download` (`mode: "file"`), then `logs_clean` to free the quota.

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
