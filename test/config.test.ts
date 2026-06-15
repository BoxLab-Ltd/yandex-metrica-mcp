import { describe, expect, it } from 'bun:test'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
    it('loads a minimal valid config', () => {
        const cfg = loadConfig({
            YANDEX_METRIKA_TOKEN: 'abc',
        } as NodeJS.ProcessEnv)
        expect(cfg.token).toBe('abc')
        expect(cfg.baseUrl).toBe('https://api-metrika.yandex.net')
        expect(cfg.defaultCounterId).toBeUndefined()
        expect(cfg.lang).toBe('en')
        expect(cfg.userAgent).toMatch(/^yandex-metrica-mcp\//)
    })

    it('allows a missing token (credentials may come from a token file)', () => {
        const cfg = loadConfig({} as NodeJS.ProcessEnv)
        expect(cfg.token).toBeUndefined()
        expect(cfg.oauthClientId).toBeUndefined()
    })

    it('reads the OAuth client credentials when present', () => {
        const cfg = loadConfig({
            YANDEX_OAUTH_CLIENT_ID: 'cid',
            YANDEX_OAUTH_CLIENT_SECRET: 'sec',
        } as NodeJS.ProcessEnv)
        expect(cfg.oauthClientId).toBe('cid')
        expect(cfg.oauthClientSecret).toBe('sec')
        expect(cfg.oauthBaseUrl).toBe('https://oauth.yandex.com')
    })

    it('coerces the counter id to a number', () => {
        const cfg = loadConfig({
            YANDEX_METRIKA_TOKEN: 'abc',
            YANDEX_METRIKA_COUNTER_ID: '42',
        } as NodeJS.ProcessEnv)
        expect(cfg.defaultCounterId).toBe(42)
    })

    it('strips a trailing slash from the base URL', () => {
        const cfg = loadConfig({
            YANDEX_METRIKA_TOKEN: 'abc',
            YANDEX_METRIKA_BASE_URL: 'https://example.test/',
        } as NodeJS.ProcessEnv)
        expect(cfg.baseUrl).toBe('https://example.test')
    })

    it('rejects an invalid base URL', () => {
        expect(() =>
            loadConfig({
                YANDEX_METRIKA_TOKEN: 'abc',
                YANDEX_METRIKA_BASE_URL: 'not-a-url',
            } as NodeJS.ProcessEnv),
        ).toThrow()
    })
})
