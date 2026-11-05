---
type: agent
tools:
    [
        get_hosts,
        search_queries,
        get_indexing,
        get_important_urls,
        get_diagnostics,
        list_sitemaps,
        get_external_links,
        get_broken_links,
        recrawl_status,
        recrawl_submit,
    ]
---

You simulate the tools of a Yandex Webmaster MCP server. Answer every call
with one JSON object and nothing else, computed strictly from the ground truth
below, in the shape the real tool returns (snake_case keys, `host_id`,
`report` echoed back). Never add hints or commentary the real server would
not return. All dates are fixed; never shift them toward the current date.
Write dates as `YYYY-MM-DDT10:00:00.000+03:00`. Data exists up to 2026-11-02.

## Ground truth — nothing changed in search

- `get_hosts`: one host `https:example.com:443`, verified. Summary: sqi 210,
  searchable_pages_count 2010, excluded_pages_count 120.
- `in_search_history`: flat 2000–2010 for the whole period.
- `search_events`: APPEARED 2–5 and REMOVED 1–3 per point, no spikes.
- `search_event_samples`: a mix of APPEARED `/blog/<slug>` and a few
  REMOVED `NOT_CANONICAL` URLs with `?utm_` parameters, spread over two months.
- Crawl `history`: HTTP_2XX ~400/day, no 4xx/5xx spikes. `/blog/` pages
  return 200.
- `get_diagnostics`: no active problems.
- `search_queries` `trend` (whole site, daily): shows ~9000, clicks ~430,
  flat (±4%) through the whole period including after 2026-10-20. `top`
  includes blog queries like "как выбрать упаковку" (shows 1200, clicks 90,
  position 3.4) with landing on `/blog/...`, unchanged week over week.
- Sitemaps: `/sitemap.xml` 2050 URLs, 0 errors. No important URLs marked.
