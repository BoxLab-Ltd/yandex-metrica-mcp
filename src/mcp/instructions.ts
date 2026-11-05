export const SERVER_INSTRUCTIONS = [
    'Yandex Metrica analytics. Start with get_metadata (counters) and describe_counter (goals, filters).',
    'Rules for correct conclusions:',
    "1. The API counts robots by default: add ym:s:isRobot=='No' (ym:pv:isRobot=='No' for hits) to filters, joined with AND.",
    '2. Compare complete, like-for-like periods: end on yesterday (today is partial), equal lengths with the same weekday mix.',
    '3. If meta.sampled is true and the number drives a decision, re-run with accuracy="full" and say it was sampled.',
    '4. users, rates and averages are not additive: never sum daily or per-row users — take totals from one query over the whole period.',
    '5. Build conversions from explicit goal ids (ym:s:goal<id>reaches/conversionRate). Avoid "any goal" metrics and auto-goals ("Автоцель:") unless asked.',
    '6. Keep one attribution family (lastsign* by default) per analysis and name it.',
    '7. A metric or goal dropping to ~0 while visits stay flat is usually a tracking break, not behaviour — check goals, chart annotations and recent deploys.',
    '8. Show absolute counts next to percentages; changes on ~100 visits or ~20 conversions are noise.',
    '9. Name the counter, periods, filters, attribution and sampling in the answer; every number must come from a tool result.',
].join('\n')

export const WRITE_INSTRUCTIONS = [
    'Write tools (manage_annotation, upload_expenses) change the counter for everyone who uses it:',
    '- Make a change only when the user asked for it; never as a side effect of analysis.',
    '- Every change is confirmed by the user. If a tool returns confirmed:false with a confirm_token, show the summary, wait for the user to agree, then repeat the call with confirmToken — never confirm on their behalf.',
    '- Run upload_expenses with dryRun:true first and show the preview; uploads add up, so a repeat doubles the expenses.',
].join('\n')
