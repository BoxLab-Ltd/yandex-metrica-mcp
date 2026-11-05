---
type: llm
weight: 4
---

Ground truth: people visits fell about 20% from 2026-10-19. Almost all of it is
Yandex organic search to /catalog/ pages (Google, direct and ads are flat).
Webmaster shows ~580 /catalog/ pages removed from search on 2026-10-18…22 with
reason NO_INDEX, pages in search 2000 → 1420, Yandex clicks down from 10-20.
Cause: the catalog pages got a noindex (likely a release around 10-17).

PASS if the answer (1) localizes the drop to Yandex organic search and the
/catalog/ landing pages, (2) names the NO_INDEX removal of catalog pages from
Yandex search as the cause, backed by Webmaster data, and (3) recommends
removing the noindex (and then a recrawl or waiting for re-indexing).

FAIL if the cause is not NO_INDEX on /catalog/, or the drop is not localized,
or the answer blames robots, seasonality or tracking.
