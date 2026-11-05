# yandex-insights

Claude Code skills that analyse a site with Yandex Metrica and Yandex
Webmaster together. The plugin ships no server of its own: it uses the tools
of the [`yandex-metrica-mcp`](../..) and
[`yandex-webmaster-mcp`](https://github.com/BoxLab-Ltd/yandex-webmaster-mcp)
plugins. Metrica is required; without Webmaster the skills still work and say
which checks they could not run.

```
/plugin marketplace add BoxLab-Ltd/yandex-metrica-mcp
/plugin install yandex-metrica-mcp@boxlab
/plugin install yandex-webmaster-mcp@boxlab
/plugin install yandex-insights@boxlab
```

## Skills

- **`traffic-drop`** — why traffic or conversions fell: confirm the drop,
  date it, find the segment that moved, tell a tracking break from a real
  loss, and check indexing and search causes in Webmaster.
- **`weekly-report`** — a one-screen report for the last full week against
  the week before: traffic and explicit-goal conversions without robots, the
  few changes above the noise bar, search health and how fresh it is.

## Evals

Mocked Metrica and Webmaster tools, so no real API is touched:

```bash
claude plugin eval . --ablation none
claude plugin eval . --ablation none --eval-dir evals-metrica-only
```
