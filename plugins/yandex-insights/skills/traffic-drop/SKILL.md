---
name: traffic-drop
description: Investigate a drop (or spike) in site traffic or conversions with Yandex Metrica and, when connected, Yandex Webmaster — confirm it is real, date it, find the segment that moved, tell a tracking break from a real loss, and check search causes. Use when asked why traffic, visits, users, search traffic or conversions fell or grew, "what happened on <date>", or whether a drop is real.
---

# Traffic drop investigation

A drop is a claim to test, not a fact to explain. Most "drops" are robots,
calendar effects, a broken counter or one segment — find which before naming
a cause. Work through the steps in order and stop as soon as the evidence
answers the question.

## 0. Know your sources

- **Metrica** tools (`run_comparison`, `run_timeseries`, `run_report`,
  `describe_counter`) are required. Without them, say so and stop.
- **Webmaster** tools (`get_hosts`, `get_indexing`, `search_queries`, …) are
  optional. If they are not available, do the Metrica steps, then list the
  search hypotheses you could not check and how the user can check them
  (install the yandex-webmaster-mcp plugin, or look in Webmaster: Indexing →
  Pages in search, Diagnostics).
- If a `metrica-hygiene` or `webmaster-audit` skill is available, its rules
  apply here too.

## 1. Confirm the drop

- `run_comparison` of the period in question (B) against a baseline (A) of the
  same length and weekday mix, both complete (end yesterday or earlier),
  `filtersA`/`filtersB` = `ym:s:isRobot=='No'`, metrics `ym:s:visits`,
  `ym:s:users`.
- Also compare the same weeks a year back (shift by 364 days) when the
  baseline might be seasonal (holidays, summer, New Year).
- Give absolute numbers. If the change is within noise (a few percent, or a
  small base), say there is no real drop and stop. If the unfiltered drop is
  large but people are flat, it was robots — say so and stop.

## 2. Date it

`run_timeseries` daily over ~6 weeks (robots excluded). A **step** on one day
points to a release, a tracking change or a search event; a **slope** points
to rankings, demand or seasonality. Note the first day of the change.

## 3. Find where it is

Break the comparison down one dimension at a time and compute each row's
share of the total delta (row delta / total delta):

1. `ym:s:lastsignTrafficSource` — which source moved;
2. inside that source: `ym:s:lastsignSearchEngineRoot` for search,
   `ym:s:lastsignUTMSource`/`ym:s:lastsignUTMCampaign` for ads,
   `ym:s:referer` for links;
3. `ym:s:startURLPath` (landing page) — which pages lost entries;
4. `ym:s:deviceCategory`, `ym:s:regionCountryName` if still unclear.

Filter by the moved segment (`AND`-ed with the robot filter) to go a level
deeper. Stop when one segment explains most of the delta (≳ 70%). A drop
spread evenly across all sources and pages points to the counter or the
calendar, not to one channel.

## 4. Tracking break or real loss

- **Goals vs visits.** A goal or e-commerce metric falling sharply while
  visits stay flat is almost always tracking (the goal or its JS call was
  removed, conditions changed). Check `describe_counter` goals.
- **All pages of one section at once, step-like**, often means the counter
  code is missing there after a release.
- **Cross-check with Webmaster.** `search_queries` `report: "trend"` gives
  clicks from Yandex search. Compare its _trend_ with Metrica's
  Yandex-organic visits over the same dates — absolute numbers never match
  (clicks ≠ visits, blockers), but the shapes should. Webmaster clicks flat
  while Metrica Yandex visits fell → tracking break, not lost traffic.
  Both fell → a real loss in search.

## 5. Search causes (Webmaster)

Only when the loss is in Yandex organic traffic:

- **Data date first.** Note the last date of each Webmaster report; if the
  data ends before the drop started, say it cannot explain the drop.
- `get_indexing` `in_search_history` and `search_events` around the drop
  date: a step down in pages in search, a spike of `REMOVED_FROM_SEARCH`.
- `search_event_samples`: are the landing pages from step 3 among the
  removed? With what `excluded_url_status`? (`NO_INDEX`, `HTTP_ERROR`,
  `DUPLICATE` on pages meant to rank are the usual culprits.)
- `get_diagnostics`: `FATAL`/`CRITICAL` problems since around that date.
- `get_indexing` `history`: a 4xx/5xx spike on the date.
- `search_queries` `trend`: shows fell → demand or rankings (compare
  positions); shows flat and positions flat but clicks fell → the result
  snippet or the search page changed.

## 6. Other causes to rule out

Holidays and weekday mix; an ad campaign paused (Ad traffic or a UTM source
gone); a big referrer or newsletter missing from the baseline; a site
migration or domain move (redirects to a new host whose counter differs).

## Report

1. **Verdict** in one line: real or not, how big (absolute and %), since when.
2. **Where**: the segment(s) and their share of the delta.
3. **Cause**: confirmed (with the evidence) or the leading hypothesis and what
   would confirm it. Keep confirmed and hypothetical apart.
4. **What to do**: concrete, at most five steps.
5. **Not checked**: missing sources (e.g. Webmaster not connected), stale
   data, anything that needs a look at the site.

State the counter, periods, robot filter and attribution once. Every number
comes from a tool result in this conversation.
