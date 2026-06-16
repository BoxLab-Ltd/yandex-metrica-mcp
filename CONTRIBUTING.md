# Contributing

Thanks for your interest in improving `yandex-metrica-mcp`.

## Development

This project is [Bun](https://bun.sh)-first; the published artifact is
Node-compatible.

```bash
bun install
bun run dev        # run from source with hot reload
bun run typecheck
bun run lint
bun test
bun run build      # emit dist/ with tsc
```

Run `bun run try` (with `YANDEX_METRIKA_TOKEN` set, or a cached login) for a
quick live check against the real API.

## Pull requests

- Keep changes focused; one logical change per PR.
- Make sure `bun run typecheck`, `bun run lint`, `bun test`, and `bun run build`
  all pass.
- Tools are **read-only** — please keep it that way unless a write feature is
  explicitly gated behind a flag.
- New dimensions/metrics in `src/api/catalog.ts` must be **verified against the
  official Yandex Metrica docs** — do not add identifiers you haven't confirmed.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`, …).
