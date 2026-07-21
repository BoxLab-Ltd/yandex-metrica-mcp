import { isCustomApp } from '@boxlab/yandex-mcp-core'
import { describe, expect, it } from 'bun:test'
import { loadAuthConfig, loadConfig } from '../src/config.js'

describe('loadConfig', () => {
    it('loads a minimal valid config with defaults', () => {
        const cfg = loadConfig({} as NodeJS.ProcessEnv)
        expect(cfg.baseUrl).toBe('https://api-metrika.yandex.net')
        expect(cfg.defaultCounterId).toBeUndefined()
        expect(cfg.lang).toBe('en')
        expect(cfg.userAgent).toMatch(/^yandex-metrica-mcp\//)
    })

    it('coerces the counter id to a number', () => {
        const cfg = loadConfig({
            YANDEX_METRIKA_COUNTER_ID: '42',
        } as NodeJS.ProcessEnv)
        expect(cfg.defaultCounterId).toBe(42)
    })

    it('strips a trailing slash from the base URL', () => {
        const cfg = loadConfig({
            YANDEX_METRIKA_BASE_URL: 'https://example.test/',
        } as NodeJS.ProcessEnv)
        expect(cfg.baseUrl).toBe('https://example.test')
    })

    it('rejects an invalid base URL', () => {
        expect(() =>
            loadConfig({
                YANDEX_METRIKA_BASE_URL: 'not-a-url',
            } as NodeJS.ProcessEnv),
        ).toThrow()
    })
})

describe('loadAuthConfig', () => {
    it('defaults to the embedded public client and metrika:read scope', () => {
        const auth = loadAuthConfig({} as NodeJS.ProcessEnv)
        expect(auth.scope).toBe('metrika:read')
        expect(auth.appName).toBe('yandex-metrica-mcp')
        expect(auth.embeddedClientId).toBe('6f14d1c1384440b1b2915f6d956da84b')
        expect(auth.staticToken).toBeUndefined()
        expect(isCustomApp(auth)).toBe(false)
    })

    it('reads the static token from YANDEX_METRIKA_TOKEN', () => {
        const auth = loadAuthConfig({
            YANDEX_METRIKA_TOKEN: 'abc',
        } as NodeJS.ProcessEnv)
        expect(auth.staticToken).toBe('abc')
    })

    it('lets the user override with their own app credentials', () => {
        const auth = loadAuthConfig({
            YANDEX_OAUTH_CLIENT_ID: 'cid',
            YANDEX_OAUTH_CLIENT_SECRET: 'sec',
        } as NodeJS.ProcessEnv)
        expect(auth.customClientId).toBe('cid')
        expect(auth.customClientSecret).toBe('sec')
        expect(auth.oauthBaseUrl).toBe('https://oauth.yandex.com')
        expect(isCustomApp(auth)).toBe(true)
    })
})
