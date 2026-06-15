import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../src/config.js'
import { resolveTokenProvider } from '../src/auth/resolve.js'
import { createFileTokenStore } from '../src/auth/tokenStore.js'

function envWithTokenFile(extra: Record<string, string> = {}): {
    env: NodeJS.ProcessEnv
    file: string
    cleanup: () => void
} {
    const dir = mkdtempSync(join(tmpdir(), 'ymmcp-resolve-'))
    const file = join(dir, 'token.json')
    return {
        env: { YANDEX_METRIKA_TOKEN_FILE: file, ...extra } as NodeJS.ProcessEnv,
        file,
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
    }
}

describe('resolveTokenProvider', () => {
    it('throws actionable guidance when no credentials exist', () => {
        const { env, cleanup } = envWithTokenFile()
        try {
            expect(() => resolveTokenProvider(loadConfig(env), env)).toThrow(
                /No Yandex Metrica credentials/,
            )
        } finally {
            cleanup()
        }
    })

    it('uses the static env token when no token file is present', async () => {
        const { env, cleanup } = envWithTokenFile({
            YANDEX_METRIKA_TOKEN: 'static-tok',
        })
        try {
            const { provider, mode } = resolveTokenProvider(
                loadConfig(env),
                env,
            )
            expect(mode).toMatch(/static/)
            expect(await provider.getAccessToken()).toBe('static-tok')
        } finally {
            cleanup()
        }
    })

    it('prefers a cached token file over the static env token', async () => {
        const { env, file, cleanup } = envWithTokenFile({
            YANDEX_METRIKA_TOKEN: 'static-tok',
        })
        try {
            createFileTokenStore(file).write({
                accessToken: 'cached-tok',
                refreshToken: 'RT',
                expiresAt: 9_999_999_999_999,
            })
            const { provider, mode } = resolveTokenProvider(
                loadConfig(env),
                env,
            )
            // No OAuth client creds → static use of the cached access token.
            expect(mode).toMatch(/token file without refresh/)
            expect(await provider.getAccessToken()).toBe('cached-tok')
        } finally {
            cleanup()
        }
    })

    it('uses a refreshing provider when the token file and OAuth creds coexist', () => {
        const { env, file, cleanup } = envWithTokenFile({
            YANDEX_OAUTH_CLIENT_ID: 'cid',
            YANDEX_OAUTH_CLIENT_SECRET: 'sec',
        })
        try {
            createFileTokenStore(file).write({
                accessToken: 'cached-tok',
                refreshToken: 'RT',
                expiresAt: 9_999_999_999_999,
            })
            const { mode } = resolveTokenProvider(loadConfig(env), env)
            expect(mode).toMatch(/token file with refresh/)
        } finally {
            cleanup()
        }
    })
})
