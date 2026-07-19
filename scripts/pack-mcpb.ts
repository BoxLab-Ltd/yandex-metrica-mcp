#!/usr/bin/env bun
// Build the Desktop Extension (.mcpb): a single tree-shaken bundle of the server
// (no node_modules) plus the manifest, package.json (for the runtime version/name
// read and "type":"module") and the icon, packed into one installable file.
import { $ } from 'bun'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

const out = process.argv[2] ?? 'yandex-metrica-mcp.mcpb'
const stage = '.mcpb-build'

rmSync(stage, { recursive: true, force: true })
mkdirSync(`${stage}/dist`, { recursive: true })
mkdirSync(`${stage}/assets`, { recursive: true })

console.log('==> Bundling the server into a single file')
await $`bun build src/index.ts --target=node --format=esm --outfile=${stage}/dist/index.js`

console.log('==> Staging manifest, package.json and icon')
cpSync('manifest.json', `${stage}/manifest.json`)
cpSync('package.json', `${stage}/package.json`)
cpSync('assets/icon-512.png', `${stage}/assets/icon-512.png`)

console.log('==> Validating and packing')
await $`npx -y @anthropic-ai/mcpb validate ${stage}/manifest.json`
await $`npx -y @anthropic-ai/mcpb pack ${stage} ${out}`
await $`npx -y @anthropic-ai/mcpb info ${out}`
