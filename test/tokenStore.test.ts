import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    createFileTokenStore,
    defaultTokenPath,
} from '../src/auth/tokenStore.js'

describe('tokenStore', () => {
    it('roundtrips a token set and writes it with 0600 perms', () => {
        const dir = mkdtempSync(join(tmpdir(), 'ymmcp-'))
        // Nest one level deeper so write() actually creates the leaf dir.
        const leaf = join(dir, 'yandex-metrica-mcp')
        const path = join(leaf, 'token.json')
        const store = createFileTokenStore(path)
        try {
            expect(store.read()).toBeNull()
            const ts = {
                accessToken: 'AT',
                refreshToken: 'RT',
                expiresAt: 123456,
                scope: 'metrika:read',
            }
            store.write(ts)
            expect(store.read()).toEqual(ts)
            expect(statSync(path).mode & 0o777).toBe(0o600)
            expect(statSync(leaf).mode & 0o777).toBe(0o700)
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('honors YANDEX_METRIKA_TOKEN_FILE over everything else', () => {
        expect(
            defaultTokenPath({
                YANDEX_METRIKA_TOKEN_FILE: '/tmp/custom.json',
                XDG_CONFIG_HOME: '/cfg',
            } as NodeJS.ProcessEnv),
        ).toBe('/tmp/custom.json')
    })

    it('falls back to XDG_CONFIG_HOME', () => {
        expect(
            defaultTokenPath({ XDG_CONFIG_HOME: '/cfg' } as NodeJS.ProcessEnv),
        ).toBe('/cfg/yandex-metrica-mcp/token.json')
    })
})
