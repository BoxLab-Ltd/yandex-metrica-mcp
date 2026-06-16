# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-06-16

### Changed

- Automated releases: publish to npm with provenance from CI via Trusted
  Publishing (OIDC) on a GitHub Release, with a version/tag guard.
- Bump `actions/checkout` and `actions/setup-node` to v6 in workflows.

## [0.1.1] - 2026-06-16

### Fixed

- Correct the `mcpName` casing to `io.github.BoxLab-Ltd/yandex-metrica-mcp` so
  the package can be claimed in the official MCP registry.

## [0.1.0] - 2026-06-16

### Added

- Read-only MCP server for Yandex Metrica with five tools: `run_report`,
  `run_comparison`, `run_drilldown`, `run_timeseries`, and `get_metadata`.
- Reporting API client with retry/backoff, a 3-concurrent token bucket, and a
  request timeout covering the response body.
- Zero-setup interactive login (authorization-code + PKCE, built-in public
  client) plus static-token and own-app auth modes.
- Curated, docs-verified catalog of 50 dimensions and 21 metrics, including
  e-commerce, time, and geo fields.
- Built-in context control: field selection on by default, low default limits,
  and sampling/quota surfaced to the model.

[Unreleased]: https://github.com/BoxLab-Ltd/yandex-metrica-mcp/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/BoxLab-Ltd/yandex-metrica-mcp/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/BoxLab-Ltd/yandex-metrica-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/BoxLab-Ltd/yandex-metrica-mcp/releases/tag/v0.1.0
