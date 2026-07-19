#!/usr/bin/env bash
# Build the Desktop Extension (.mcpb): a single tree-shaken bundle of the server
# (no node_modules) plus the manifest, package.json (for the runtime version/name
# read and "type":"module") and the icon, packed into one installable file.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="${1:-yandex-metrica-mcp.mcpb}"
STAGE=".mcpb-build"

rm -rf "$STAGE"
mkdir -p "$STAGE/dist" "$STAGE/assets"

echo "==> Bundling the server into a single file"
bun build src/index.ts --target=node --format=esm --outfile="$STAGE/dist/index.js"

echo "==> Staging manifest, package.json and icon"
cp manifest.json package.json "$STAGE"/
cp assets/icon-512.png "$STAGE/assets/"

echo "==> Validating and packing"
npx -y @anthropic-ai/mcpb validate "$STAGE/manifest.json"
npx -y @anthropic-ai/mcpb pack "$STAGE" "$OUT"
npx -y @anthropic-ai/mcpb info "$OUT"
