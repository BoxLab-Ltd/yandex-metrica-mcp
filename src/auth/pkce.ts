import { createHash, randomBytes } from 'node:crypto'

/** A PKCE verifier/challenge pair (RFC 7636, S256). */
export interface PkcePair {
    verifier: string
    challenge: string
    method: 'S256'
}

function base64Url(buf: Buffer): string {
    return buf
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

/** Generate a fresh PKCE pair: a random verifier and its S256 challenge. */
export function generatePkce(): PkcePair {
    const verifier = base64Url(randomBytes(48))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    return { verifier, challenge, method: 'S256' }
}
