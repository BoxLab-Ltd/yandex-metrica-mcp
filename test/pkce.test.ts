import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { generatePkce } from '../src/auth/pkce.js'

function base64Url(buf: Buffer): string {
    return buf
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

describe('generatePkce', () => {
    it('produces a URL-safe verifier and a matching S256 challenge', () => {
        const { verifier, challenge, method } = generatePkce()
        expect(method).toBe('S256')
        expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/)
        expect(verifier.length).toBeGreaterThanOrEqual(43)
        const expected = base64Url(
            createHash('sha256').update(verifier).digest(),
        )
        expect(challenge).toBe(expected)
    })

    it('is random across calls', () => {
        expect(generatePkce().verifier).not.toBe(generatePkce().verifier)
    })
})
