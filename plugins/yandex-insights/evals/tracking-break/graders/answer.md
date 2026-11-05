---
type: llm
weight: 4
---

Ground truth: from 2026-10-20 Metrica records no visits on /blog/ pages from
any source (the blog moved to a new engine without the counter code), while
everything else is flat. Webmaster shows Yandex search clicks flat, no pages
removed from search, no crawl errors — so people still come; they are just
not counted.

PASS if the answer concludes it is a tracking / counter problem on /blog/
(visits not recorded), not a real loss of visitors, and supports it with the
flat Webmaster clicks or indexing; it should recommend checking the Metrica
counter code on /blog/ pages.

FAIL if it presents the drop as a real loss of traffic or rankings, or does
not identify /blog/.
