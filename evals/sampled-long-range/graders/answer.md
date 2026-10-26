---
type: llm
weight: 3
---

A 6-month report with dimensions comes back sampled (sample_share 0.1) unless
it is re-run with accuracy "full".

PASS if the final figures come from a non-sampled (accuracy "full") query, OR
the answer clearly tells the user the figures are based on a 10% sample and
are approximate.

FAIL if sampled figures are presented as exact with no mention of sampling.
