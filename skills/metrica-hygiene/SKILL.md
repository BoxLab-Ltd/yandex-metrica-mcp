---
name: metrica-hygiene
description: Rules for drawing correct conclusions from Yandex Metrica data — exclude robots, compare complete and comparable periods, respect sampling, never sum users, use explicit goals, state attribution. Use whenever you answer a question with the yandex-metrica tools (run_report, run_comparison, run_timeseries, run_drilldown, logs_*) — traffic or conversion changes, "did X drop/grow", source or page breakdowns, weekly numbers, any report a person will act on.
---

# Metrica hygiene

Metrica's API returns whatever you ask for, including numbers that look right and
are wrong. These rules keep an analysis honest. Apply them silently while
querying, then surface the ones that changed the answer.

## Before the first query

1. **Pin the counter.** No `counterId` known → `get_metadata`. Then
   `describe_counter` with `include: ["settings", "goals", "filters"]`:
    - `goals` gives the real goal ids (rule 7);
    - `filters` shows what the counter already drops — an active `exclude` / `me`
      filter means the owner's own visits are not in the data, a `disabled` one
      does nothing.
2. **Know the question's unit.** Visits (`ym:s:`) and page views/events (`ym:pv:`)
   live in separate namespaces; one call cannot mix them.

## While querying

3. **Exclude robots — the API counts them by default.** Add
   `ym:s:isRobot=='No'` (or `ym:pv:isRobot=='No'`) to `filters`, joined with
   `AND` to any other condition, in every report, comparison and time series.
   Before comparing periods, check the robot share of each one
   (`dimensions: ["ym:s:isRobot"]` or the metric `ym:s:robotPercentage`): when it
   differs between the periods, an unfiltered "drop" or "spike" may be bots
   leaving or arriving — say so.
4. **Compare complete, like-for-like periods.**
    - End on `yesterday`; `today` is partial (see `data_lag_seconds` in `meta`).
    - Equal lengths with the same weekday mix: whole weeks (7/14/28 days), a week
      against the previous week, year-over-year shifted by 364 days so weekdays
      line up. Weekends and public holidays (New Year, May holidays) move traffic
      on their own.
    - For "did it drop?", `run_comparison` with A = the baseline period and
      B = the period in question gives server-side `delta` and `delta_pct`.
5. **Watch sampling.** If `meta.sampled` is `true` and the number drives a
   decision, re-run with `accuracy: "full"` (or a shorter range / fewer
   dimensions) and say the original figure was sampled.
6. **Do not add up non-additive metrics.** `users`, `newUsers`, rates and
   averages are not sums: daily users do not add up to weekly users, and row
   users do not add up to the total (one person can be in two rows). Take a
   period's figure from a single query over the whole period — its `totals`.
7. **Use explicit goals.** Build conversions from the goal ids returned by
   `describe_counter` — `ym:s:goal<id>reaches`, `ym:s:goal<id>conversionRate` —
   and name the goal in the answer. Treat as noise unless the user asks for them:
    - `ym:s:sumGoalReachesAny` / `ym:s:anyGoalConversionRate` ("any goal") — it
      sums every goal, auto-goals included, and can read 50%+ on a site whose
      real conversion is a few percent;
    - auto-goals (`name` starts with "Автоцель:", `type` `form`, `contact_data`,
      `messenger`, `social`, `payment_system`, …) — Yandex creates and changes
      them, they break without the owner noticing.
      Owner-defined `action` (JS) and `url` goals are the reliable ones.
8. **Keep one attribution.** Traffic-source dimensions come in families —
   `lastsign*` (last significant, the default), `last*`, `first*`, and others.
   Use one family per analysis, and the same one for conversions by source; say
   which one you used.
9. **Do not mistake a page for the whole.** When a result says more rows remain,
   top-N rows are not the total — quote `totals`, or page further.

## Before answering

10. **Separate a tracking break from a real change.** A metric or one goal
    falling to (near) zero overnight while visits stay flat is almost always
    tracking — the counter code or a JS goal was removed in a release, a goal's
    conditions changed, a URL moved. Check `describe_counter` (`goals`,
    `operations`) and ask about recent deploys before calling it user behaviour.
11. **Weigh small numbers.** Give absolute counts next to every percentage.
    Moves on a base under ~100 visits or ~20 conversions per period are within
    noise — say "too few to tell" rather than "dropped 40%".
12. **Know the definitions.** A Metrica bounce is a visit with one page view
    shorter than 15 seconds — not comparable to Google Analytics' bounce rate.
13. **State the frame and stick to the data.** Every answer names the counter,
    the period(s), the filters (robots excluded), the attribution and whether
    anything was sampled. Every number comes from a tool result in this
    conversation — never estimate a missing one; query it or say it is unknown.
    Mark causes you have not checked as hypotheses.

## Example

"Did traffic drop last week?"

1. `describe_counter` → goals and filters.
2. `run_comparison`, `metrics: ["ym:s:visits", "ym:s:users"]`, A = the week
   before last, B = last week (both Monday–Sunday, ending yesterday or earlier),
   `filtersA` and `filtersB` = `ym:s:isRobot=='No'`.
3. If the delta matters, break it down — the same comparison with
   `dimensions: ["ym:s:lastsignTrafficSource"]` — to find which source moved.
4. Answer in this shape: "Visits without robots: 1 412 → 1 236 (−12%), last
   week (Mon–Sun) vs the week before; almost all of it is organic search (−160).
   Robots were 4% and 5% of visits, so they do not explain it. Not sampled;
   attribution: last significant source."
