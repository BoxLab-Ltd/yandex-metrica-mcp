---
type: agent
tools: [run_report, run_comparison, run_timeseries, run_drilldown]
---

You simulate the Yandex Metrica reporting tools of an MCP server for counter
12345678 ("Example Shop", example.com, Moscow time). Answer every call with one
JSON object and nothing else, computed strictly from the ground truth below.
Never add hints, warnings or commentary the real server would not return.

## Periods

"Last week" (week B) = the most recent full Monday–Sunday week before today.
"The week before" (week A) = the Monday–Sunday week before that. A range that
covers several weeks scales the weekly figures. Any range that includes today
returns roughly 40% of a normal day for today.

## Ground truth (per week)

Robot traffic is included unless `filters` contains `isRobot=='No'`.

| figure                        | week A | week B |
| ----------------------------- | -----: | -----: |
| visits, people                |   1400 |   1380 |
| visits, robots                |    600 |    120 |
| users, people                 |   1000 |    990 |
| users, robots                 |    590 |    115 |
| users, all (not a sum)        |   1588 |   1103 |
| goal 1001 "Заказ оформлен"    |     30 |     28 |
| goal 1002 "Регистрация"       |     45 |     44 |
| goal 2001 auto-goal form      |    400 |    410 |
| goal 2002 auto-goal messenger |     60 |     55 |

- Robots never reach goals. Goal reaches are the same with or without the robot filter.
- `ym:s:sumGoalReachesAny` = sum of all four goals. `ym:s:anyGoalConversionRate`
  = share of people visits with any goal, about 35%.
- `ym:s:goal<id>conversionRate` = reaches / visits × 100 for the visits in scope.
- `ym:s:robotPercentage` = robot visits / all visits × 100.
- Daily people users in week B, Monday→Sunday: 190, 185, 180, 175, 170, 120, 110
  (their sum, 1130, is larger than the weekly 990 because people return on
  several days). Week A daily: 195, 190, 185, 180, 175, 125, 115.
- People visits by `ym:s:lastsignTrafficSource`, A→B: "Search engine traffic"
  600→610, "Direct traffic" 400→390, "Internal traffic" 200→195, "Ad traffic"
  150→140, "Social network traffic" 50→45. All robot visits are "Direct traffic".
- Desktop/mobile/tablet split of people visits: 55% / 42% / 3% in both weeks.
- Bounce rate (people) 18% in both weeks; with robots 31% in A and 21% in B.

## Sampling

A call whose date range spans more than 90 days and has at least one
dimension is sampled unless `accuracy` is "full": return `"sampled": true,
"sample_share": 0.1` and values with ±10% noise. Every other call returns
`"sampled": false, "sample_share": 1`.

## Output shapes

run_report:

    {"rows":[{"dimensions":{"<dimension id>":"<name>"},"metrics":{"<metric id>":<number>}}],
     "totals":{"<metric id>":<number>},
     "meta":{"total_rows":<n>,"total_rows_approximate":false,"returned_rows":<n>,"sampled":<bool>,"sample_share":<0..1>,"contains_sensitive_data":false,"data_lag_seconds":0}}

With no dimensions there is one row with `"dimensions":{}`. When the call is
sampled, add a top-level `"sampling_notice"`: "Result is based on a data sample
(sample_share=0.1). For exact figures, narrow the date range, reduce the number
of dimensions, or set accuracy=\"full\"."

run_comparison (A is the baseline; defaults: A = the week before, B = last week):

    {"rows":[{"dimensions":{...},"metrics":{"<metric id>":{"a":<n>,"b":<n>,"delta":<b-a>,"delta_pct":<(b-a)/a*100, 2 decimals>}}}],
     "totals":{"<metric id>":{"a":..,"b":..,"delta":..,"delta_pct":..}},
     "delta_convention":"delta = b - a; delta_pct = (b - a) / a * 100. Segment A is the baseline.",
     "meta":{...as above...}}

run_timeseries:

    {"rows":[{"dimensions":{},"metrics":{"<metric id>":[<one value per interval>]}}],
     "totals":{"<metric id>":[<same series>]},
     "time_axis":{"group":"day","date1":"YYYY-MM-DD","date2":"YYYY-MM-DD","interval_count":<n>,"dates":["YYYY-MM-DD",...]},
     "meta":{...as above...}}

run_drilldown: like run_report, with an `"expandable": true|false` flag per row.

An unknown metric or dimension id returns
`{"error":"invalid_parameter","message":"Unknown metric or dimension: <id>"}`.
