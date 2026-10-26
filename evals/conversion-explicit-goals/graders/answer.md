---
type: llm
weight: 3
---

Ground truth for last week: 1380 human visits; goal 1001 "Заказ оформлен"
(order placed) reached 28 times (~2.0%), goal 1002 "Регистрация" 44 times
(~3.2%). Auto-goals ("Автоцель: …") and the "any goal" conversion (~35%) are
noise.

PASS if the headline conversion rate is built from goal 1001 and/or 1002, names
the goal(s), and lands near 2% (orders) or 3% (registrations); it may mention
the other goals as context.

FAIL if the headline figure is the "any goal" rate (~35% or similar), or an
auto-goal rate, or no goal is named.
