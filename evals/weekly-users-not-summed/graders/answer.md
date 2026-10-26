---
type: llm
weight: 3
---

Ground truth for last week (people, robots excluded): 990 unique users for the
week. Daily users Mon→Sun: 190, 185, 180, 175, 170, 120, 110 — they sum to 1130,
which is NOT the weekly figure because people return on several days. With
robots included the weekly users are 1103.

PASS if the weekly total given is 990 (robots excluded), the daily breakdown
is shown, and the answer does not present the daily values' sum as the weekly
number.

FAIL if the weekly total is 1130 (the sum of days), or 1103 is presented as
the number of people without saying it includes robots.
