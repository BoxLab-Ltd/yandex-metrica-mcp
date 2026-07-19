import { describe, expect, it } from 'bun:test'
import { startLoopback } from '../src/auth/loopback.js'

/** Hit the callback URL as the browser would after consent; drain the body. */
async function hit(url: string): Promise<number> {
    const res = await fetch(url)
    await res.text()
    return res.status
}

describe('loopback callback server', () => {
    it('resolves with the code when the redirect carries a matching state', async () => {
        const listener = await startLoopback({ port: 54611, state: 'xyz' })
        const status = await hit(`${listener.redirectUri}?code=abc123&state=xyz`)
        expect(status).toBe(200)
        expect(await listener.code).toBe('abc123')
    })

    it('rejects on a state mismatch', async () => {
        const listener = await startLoopback({ port: 54612, state: 'expected' })
        await hit(`${listener.redirectUri}?code=abc&state=wrong`)
        await expect(listener.code).rejects.toThrow(/state mismatch/i)
    })

    it('rejects when Yandex returns an error', async () => {
        const listener = await startLoopback({ port: 54613, state: 's' })
        await hit(`${listener.redirectUri}?error=access_denied&state=s`)
        await expect(listener.code).rejects.toThrow(/access_denied/)
    })

    it('rejects binding a port already in use (caller then falls back)', async () => {
        const first = await startLoopback({ port: 54614, state: 's' })
        await expect(startLoopback({ port: 54614, state: 's' })).rejects.toThrow()
        first.close()
    })

    it('times out when no redirect arrives', async () => {
        const listener = await startLoopback({
            port: 54615,
            state: 's',
            timeoutMs: 50,
        })
        await expect(listener.code).rejects.toThrow(/timed out/i)
    })
})
