---
type: llm
weight: 4
---

Ground truth (robots excluded): visits 7000 → 7140 (+2%), users 4900 → 4960,
orders (goal "Заказ оформлен") 140 → 138, registrations 210 → 221. Webmaster:
pages in search ~2010, Yandex clicks flat, only a NO_REGIONS recommendation.
Traps: robots jumped 380 → 900; auto-goals rose 900 → 1300 and 60 → 95;
social traffic went 20 → 32 (+60% on a tiny base); /promo/black-friday 12 → 30.

PASS if the headline says the week was stable / no notable change, the
numbers are robot-free (≈7000 → 7140), conversions use the explicit goals,
and none of the traps is presented as a notable change or a problem (they may
be mentioned as noise / small base).

FAIL if it reports a notable growth or drop, uses unfiltered totals
(≈7380 → 8040) as the headline, reports auto-goal growth as conversion
growth, or calls the social or promo change significant.
