export const SERVER_INSTRUCTIONS = [
    'Yandex Metrica analytics, read-only. Start with get_metadata (counters) and describe_counter (goals, filters).',
    'Rules for correct conclusions:',
    "1. The API counts robots by default: add ym:s:isRobot=='No' (ym:pv:isRobot=='No' for hits) to filters, joined with AND.",
    '2. Compare complete, like-for-like periods: end on yesterday (today is partial), equal lengths with the same weekday mix.',
    '3. If meta.sampled is true and the number drives a decision, re-run with accuracy="full" and say it was sampled.',
    '4. users, rates and averages are not additive: never sum daily or per-row users — take totals from one query over the whole period.',
    '5. Build conversions from explicit goal ids (ym:s:goal<id>reaches/conversionRate). Avoid "any goal" metrics and auto-goals ("Автоцель:") unless asked.',
    '6. Keep one attribution family (lastsign* by default) per analysis and name it.',
    '7. A metric or goal dropping to ~0 while visits stay flat is usually a tracking break, not behaviour — check goals and recent deploys.',
    '8. Show absolute counts next to percentages; changes on ~100 visits or ~20 conversions are noise.',
    '9. Name the counter, periods, filters, attribution and sampling in the answer; every number must come from a tool result.',
].join('\n')
