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
"Заказ оформлен" (action), 1002 "Регистрация" (url), 2001 "Автоцель: отправка
формы" (form), 2002 "Автоцель: переход в мессенджер" (messenger); filter:
exclude own visits (active).

## Ground truth — an ordinary week

Weeks: A = 2026-10-19 … 10-25, B = 2026-10-26 … 11-01. Data up to 2026-11-04.

Robot visits: A 380, B 900 (a crawler came in week B); robots never reach
goals. They are included only when `filters` lacks `isRobot=='No'`.
Everything below is people.

| figure                        |    A |    B |
| ----------------------------- | ---: | ---: |
| visits                        | 7000 | 7140 |
| users (whole week, not a sum) | 4900 | 4960 |
| bounce rate, %                |   18 | 17.6 |
| goal 1001 "Заказ оформлен"    |  140 |  138 |
| goal 1002 "Регистрация"       |  210 |  221 |
| goal 2001 auto form           |  900 | 1300 |
| goal 2002 auto messenger      |   60 |   95 |

People visits by `ym:s:lastsignTrafficSource`, A → B: Search engine traffic
3900 → 3960, Direct 1800 → 1790, Ad traffic 950 → 990, Link traffic 230 → 240,
Social network traffic 20 → 32, Internal 100 → 128.

By `ym:s:startURLPath` (top), A → B: `/` 1500 → 1520, `/catalog/kraft-box`
600 → 615, `/catalog/gift-box` 520 → 505, `/blog/how-to-choose-a-box`
310 → 330, `/catalog/tube-box` 280 → 290, `/promo/black-friday` 12 → 30,
others proportional (±3%).

Goals 1001/1002 split by source proportionally to visits. Days are even
(weekends ×0.8). Users ≈ 0.7 × visits per row; never equal to a sum of rows.
Not sampled. `run_comparison` returns `{a, b, delta, delta_pct}`,
`delta = b − a`.
