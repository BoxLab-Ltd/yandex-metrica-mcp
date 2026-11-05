---
name: weekly-report
description: Write a short weekly report for a site from Yandex Metrica and, when connected, Yandex Webmaster — last full week against the week before, traffic and explicit-goal conversions without robots, the few changes that matter, search health, and the data's freshness. Use when asked for a weekly report, a week-over-week summary, "how did the site do last week", or numbers for a status update.
---

# Weekly report

A weekly report is read in a minute and acted on rarely. Its job is to say
whether anything happened, not to fill a page: most weeks the honest headline
is "stable". Keep it to one screen.

## Sources

Metrica tools are required. Webmaster tools are optional: without them, write
the Metrica part and one line saying search data (pages in search,
diagnostics, Yandex clicks) was not available. If a `metrica-hygiene` or
`webmaster-audit` skill is available, its rules apply.

## Collect

1. **Weeks.** B = the last full Monday–Sunday week (or the week the user
   names), A = the week before. Never include today.
2. **Counter and goals.** `describe_counter` with
   `include: ["settings", "goals"]`. Use the owner's explicit goals (`action` and `url` types); skip
   auto-goals ("Автоцель: …") and "any goal" metrics.
3. **Headline.** `run_comparison`, A vs B, `filtersA`/`filtersB` =
   `ym:s:isRobot=='No'`, metrics `ym:s:visits`, `ym:s:users`,
   `ym:s:bounceRate` and `ym:s:goal<id>reaches` for up to three key goals.
   Take users from this query's totals — never sum days or rows.
4. **Movers.** The same comparison by
   `ym:s:lastsignTrafficSource`, then by `ym:s:startURLPath`
   (`limit` ~20). Keep only rows that pass the noise bar below.
5. **Search (Webmaster).** For the main host: `get_hosts` with `hostId`
   (pages in search, SQI), `get_diagnostics` (active problems — note any that
   started during week B), `get_indexing` `report: "search_events"` for week B
   (appeared / removed), `search_queries` `report: "trend"` for both weeks
   (shows, clicks). Note the latest data date of each; if it ends before
   week B, say "no Webmaster data for this week" instead of reporting it.

## Noise bar

Call a change notable only if it is at least **10% and at least ~50 visits**
(for goals: at least 10% and 10 conversions). Below that it is "flat" or
"about the same" — even if the percentage looks big on a small base (a source
going 20 → 32 is +60% and still nothing). Do not round notable changes into
drama either: say the number.

## Write

```
<Site>, <Mon dd> – <Sun dd> vs the week before (robots excluded)

Headline: <stable | down N% | up N%> — <one clause why, if known>

| | prev week | this week | Δ |
| visits | … | … | … |
| users | … | … | … |
| <goal name> | … | … | … |

Notable: <1–3 bullets, each with the number and the segment; or "nothing
beyond normal variation">
Search: <pages in search, removals, new problems, clicks trend — with the
data date; or "Webmaster not connected" / "no data for this week">
Next: <only if something is notable>
```

- If visits or a key goal fell notably, say where (source / landing page) in
  one line and offer to investigate with the `traffic-drop` skill — do not
  run the full investigation inside the report.
- Name the attribution once if source rows are shown (last significant
  source by default). Mention sampling only if a figure was sampled.
- Every number comes from a tool result in this conversation.
