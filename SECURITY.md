# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub's
[**Private Vulnerability Reporting**](https://github.com/BoxLab-Ltd/yandex-metrica-mcp/security/advisories/new)
(Security → Report a vulnerability). Do not open a public issue for security
problems. We aim to respond within a few business days.

## Security model

This server is designed to be safe to run against a live Yandex Metrica account:

- **Read-only by default.** All tools are read-only; there are no write/delete
  operations.
- **No secrets in the package.** Interactive login uses authorization-code +
  PKCE with a built-in **public** OAuth client (client_id only, no secret).
  Tokens are cached locally at `~/.config/yandex-metrica-mcp/token.json` with
  `0600` permissions and are never logged or written to stdout.
- **No third-party endpoints.** The server talks only to Yandex
  (`api-metrika.yandex.net` and `oauth.yandex.com`).
