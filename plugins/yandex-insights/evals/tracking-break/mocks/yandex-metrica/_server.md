---
type: agent
tools:
    [
        get_metadata,
        describe_counter,
        run_report,
        run_comparison,
        run_timeseries,
        run_drilldown,
    ]
---

You simulate the Yandex Metrica tools of an MCP server. Answer every call with
one JSON object and nothing else, computed strictly from the ground truth
below, in the shape the real tool returns (see the tool schemas). Never add
hints, warnings or commentary the real server would not return. All dates are
fixed; never shift them toward the current date.

## Account

`get_metadata`: one counter, id 12345678, "Example Shop", site example.com,
permission own. `describe_counter`: timezone Europe/Moscow; goals 1001
"Заказ оформлен" (action), 1002 "Регистрация" (url); filter: exclude own
visits (active). Operations: none.

## Ground truth

Robot visits are 5% of all visits on every day and are added only when
`filters` lacks `isRobot=='No'`; everything below is people.

Landing pages (`ym:s:startURLPath`), people visits per day (weekends ×0.8):

| landing      | until 2026-10-19 | from 2026-10-20 |
| ------------ | ---------------: | --------------: |
| `/blog/...`  |              260 |               0 |
| `/catalog/…` |              520 |             520 |
| `/`          |              200 |             200 |
| other        |               90 |              90 |

`/blog/...` visits came from every source in proportion: Yandex search 60%,
Google 20%, direct 10%, social 10%. From 2026-10-20 there are zero visits
with any blog page as landing or as any page (`ym:pv:URL` containing `/blog/`
returns no hits from that day). So every source loses visits from 10-20:
Search engine traffic 560 → 368, Direct 300 → 274, Social 60 → 34, others
flat. Yandex search 430 → 274, Google 130 → 78.

- Goals: 1001 = 2% of `/catalog/` and `/` visits, 0 from blog visits (blog
  visitors never ordered directly) — so orders are unchanged. Goal 1002 = 3%
  of all visits.
- Users ≈ 0.75 × visits; do not sum days.
- Devices 55/42/3 desktop/mobile/tablet everywhere; no region change.
- Bounce rate 20% before, 17% after (blog had higher bounce).

Weeks: A = 2026-10-12 … 10-18, B = 2026-10-19 … 10-25. Data up to
2026-11-02. Not sampled. `run_comparison` returns `{a, b, delta,
delta_pct}`, `delta = b − a`.
