# Yandex Metrica API — implementation notes

Verified against the official docs (yandex.com/dev/metrika) on 2026-06-14. These
are the load-bearing facts and gotchas the client encodes. Keep in sync with the
code in `src/api/`.

## Host & auth

- Base host: `https://api-metrika.yandex.net` (note the `-`, not `api.metrika`).
- Auth header is literally `Authorization: OAuth <token>` — **not** `Bearer`.
- Reporting API: `/stat/v1/data` (+ `/comparison`, `/bytime`, `/drilldown`).
- Management API: `/management/v1/counters`, `/management/v1/counter/{id}/goals`.
- Scope `metrika:read` is enough for reporting. 403 `access_denied` means the
  token owner lacks a grant on that counter.

## Reporting request params (`/stat/v1/data`)

- `ids` (CSV counter ids, required), `metrics` (CSV, **max 20**, required),
  `dimensions` (CSV, **max 10**), `date1` (default `6daysAgo`), `date2`
  (default `today`), `filters`, `sort` (CSV, `-` prefix = desc),
  `limit` (default 100, **max 100000**), `offset` (**1-based**, default 1),
  `accuracy` (`low|medium|high|full` or `0..1`), `preset`, `timezone`, `lang`,
  `include_undefined`, `direct_client_logins`.
- A single request must use **one namespace only**: all `ym:s:` OR all `ym:pv:`.
  Mixing is rejected.

## Response shapes differ per endpoint

Top-level meta is **snake_case** everywhere: `query`, `data`, `total_rows`,
`total_rows_rounded`, `sampled`, `contains_sensitive_data`, `sample_share`,
`sample_size`, `sample_space`, `data_lag`, `totals`, `min`, `max`.

| Endpoint      | row dimensions                  | row metrics                      | totals       | extra                                                            |
| ------------- | ------------------------------- | -------------------------------- | ------------ | ---------------------------------------------------------------- |
| `/data`       | `dimensions: DimObj[]`          | `number[]`                       | `number[]`   | `min`/`max`                                                      |
| `/comparison` | `dimensions: DimObj[]`          | `{ a: number[]; b: number[] }`   | `{ a; b }`   | dates split `_a`/`_b`, `filters_a`/`_b`; no min/max              |
| `/bytime`     | `dimensions: DimObj[]`          | `number[][]` (metric → interval) | `number[][]` | `group` param; optional `annotations`; no `sort`/`limit`         |
| `/drilldown`  | `dimension: DimObj` (singular!) | `number[]`                       | `number[]`   | `parent_id` (JSON array), per-row `expand: boolean`, `min`/`max` |

- `DimObj`: only `name` (string, nullable) is guaranteed; `id` is the usual
  optional; dimensions may add `icon_id`/`icon_type`/`favicon`/`url`/`region_id`.
  Model as `{ name: string|null; id?: string|null; [k]: unknown }`.
- `metrics` values map **positionally** to the requested `metrics` (no names in
  the row) and **may be `null`** (e.g. divide-by-zero).
- `query` echoes many resolved defaults (`attribution`, `currency`, `quantile`,
  `group`, …) — treat it as an open object.

## Rate limits & throttling

- Per user: **200 req / 5 min** to reporting, **3 concurrent**, **5000/day**.
  Per IP: 30 req/s. Resets: daily at 00:00 GMT, the 5-min window 5 min after.
- **Throttle status is ambiguous in the docs: Quotas page says `420`, Errors
  page says `429`** for the same `quota_*` errors. Treat **both 420 and 429** as
  throttled, and also branch on `error_type` starting with `quota_`.
- **No `Retry-After` header is documented.** Use our own exponential backoff.
- Also retry `backend_error` (503) and `timeout` (504).

## Error body

```json
{
    "errors": [
        {
            "error_type": "invalid_parameter",
            "message": "...",
            "location": "..."
        }
    ],
    "code": 400,
    "message": "Bad Request"
}
```

## No dimension/metric enumeration API

There is **no endpoint** that lists available `ym:s:`/`ym:pv:` dimensions and
metrics — the catalog is documentation-only. We bundle a curated subset in
`src/api/catalog.ts`. `get_metadata` returns that catalog plus the account's
live counters/goals (Management API).

- Counters need `field=goals` to populate the nested `goals[]`. Site lives under
  `site2.site` (legacy top-level `site` may be absent).
- Per-goal metrics: `ym:s:goal<id>reaches|visits|users|conversionRate`.
- Attribution placeholder `<attribution>` defaults to `lastsign`.

## Logs API (raw row-level export)

Async, under the **management** namespace. Paths
`/management/v1/counter/{id}/...`; collection = `logrequests` (plural), one
request = `logrequest/{requestId}` (singular).

- **Lifecycle:** `evaluate` (feasibility) → `create` (POST) → poll `get` until
  `status=processed` → `download` each part → `clean`. Plus `cancel` (abort a
  running one) and list (`GET logrequests`).
- **create params — query string, NOT a JSON body:** `date1`/`date2`
  (`YYYY-MM-DD`, concrete; **date2 must be earlier than today**), `source` =
  `visits`|`hits`, `fields` (CSV, ≤ **3000 chars**, prefix must match source:
  `ym:s:` for visits / `ym:pv:` for hits), optional `attribution` (UPPERCASE:
  `FIRST|LAST|LASTSIGN|...`).
- **Statuses:** `created`, `awaiting_retry` (in progress); `processed` (ready);
  `processing_failed`, `canceled`, `cleaned_by_user`,
  `cleaned_automatically_as_too_old` (terminal). A processed request's `parts[]`
  gives the part count; download `part/{0..n-1}/download`.
- **Download = TSV** (ClickHouse `TabSeparatedWithNames`): **every part** carries
  a header row — keep it once when concatenating. Values escape tab/newline/`\`,
  so split rows on raw `\n`, fields on raw `\t`, then unescape (`src/api/tsv.ts`).
- **Limits:** range ≤ 1 year/request; **~10 GB** prepared-log quota per counter
  (sum `size` of non-terminal requests) — prepared logs count until `clean`ed;
  10 req/s; requests processed sequentially; an **identical in-flight request →
  HTTP 202** (dedup, empty body — `createLogRequest` then locates it via the list).
- **No sampling** (rows are raw). Scope `metrika:read` suffices even for personal
  fields (IP, clientID, URL); we flag them (`isPersonalLogField`) and set
  `contains_personal_data` in the output rather than blocking them.
- **Client/MCP shaping:** the base client is GET+JSON; Logs adds `requestJson`
  (POST) and `streamLines` (raw TSV, line-streamed with an inactivity timeout).
  `logs_download` returns a bounded inline sample by default, or streams the full
  export to a file (`YANDEX_METRIKA_LOGS_DIR`) — raw content never enters context.

## Flagged ambiguities (do not hard-code blindly)

1. Throttle status 420 vs 429 — handle both.
2. No `Retry-After` — own backoff.
3. No documented `null`/`not set` filter operator — do not invent one.
4. `/bytime` has no `time_intervals` field — reconstruct the axis from
   `date1`/`date2`/`group`.
5. Goal `conditions[]` schema varies by goal type — model loosely.
6. Some "boolean" fields come back as numbers (0/1) — observed live for goal
   `is_favorite` and counter `favorite`. Parse them with a flexible
   boolean-or-number that normalizes to boolean (see `FlexibleBool` in
   `src/api/schemas.ts`).
