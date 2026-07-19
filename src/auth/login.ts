import { randomBytes } from 'node:crypto'
import { openBrowser } from './browser.js'
import { startLoopback } from './loopback.js'
import {
    buildAuthorizeUrl,
    exchangeCode,
    OOB_REDIRECT_URI,
    type OAuthClientConfig,
    type TokenSet,
} from './oauth.js'
import { generatePkce } from './pkce.js'

const SCOPE = 'metrika:read'

function base64Url(buf: Buffer): string {
    return buf
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

/** Only a failure to BIND the port should trigger the out-of-band fallback. */
function isBindError(err: unknown): boolean {
    const code = (err as { code?: string } | null)?.code
    return (
        code === 'EADDRINUSE' ||
        code === 'EACCES' ||
        code === 'EADDRNOTAVAIL'
    )
}

export interface LoginOptions {
    oauth: OAuthClientConfig
    loopbackPort: number
    /** Skip loopback and use the copy-paste flow directly. */
    forceOob?: boolean
    /** Progress messages (CLI stdout / server stderr). */
    log?: (message: string) => void
    /** Override how the consent URL is opened (tests inject a no-op). */
    openUrl?: (url: string) => void
    /**
     * Out-of-band fallback: given the consent URL, resolve with the code the
     * user pastes. Required for the fallback (the loopback path never calls it).
     */
    promptForCode?: (url: string) => Promise<string>
    /** How long to wait for the loopback redirect before giving up. */
    timeoutMs?: number
}

/**
 * Sign in via authorization-code + PKCE. Tries the loopback redirect first (the
 * browser returns the code automatically); falls back to the out-of-band
 * copy-paste flow when the local port cannot be bound or `forceOob` is set.
 * Returns the token set — the caller persists it.
 */
export async function interactiveLogin(opts: LoginOptions): Promise<TokenSet> {
    const open = opts.openUrl ?? openBrowser
    const pkce = generatePkce()
    const state = base64Url(randomBytes(16))

    if (!opts.forceOob) {
        let listener
        try {
            listener = await startLoopback({
                port: opts.loopbackPort,
                state,
                timeoutMs: opts.timeoutMs,
            })
        } catch (err) {
            if (!isBindError(err)) throw err
            opts.log?.(
                `Could not open the local callback port ${opts.loopbackPort}; ` +
                    'falling back to copy-paste sign-in.',
            )
        }
        if (listener) {
            const url = buildAuthorizeUrl(opts.oauth, {
                codeChallenge: pkce.challenge,
                scope: SCOPE,
                redirectUri: listener.redirectUri,
                state,
            })
            opts.log?.(
                'Opening your browser to approve access…\n' +
                    `If it does not open, paste this URL into your browser:\n  ${url}`,
            )
            open(url)
            try {
                const code = await listener.code
                return await exchangeCode(opts.oauth, {
                    code,
                    codeVerifier: pkce.verifier,
                    redirectUri: listener.redirectUri,
                })
            } finally {
                listener.close()
            }
        }
    }

    // Out-of-band fallback: the user copies the code Yandex shows them.
    if (!opts.promptForCode) {
        throw new Error(
            'Loopback sign-in is unavailable and no copy-paste handler was provided.',
        )
    }
    const url = buildAuthorizeUrl(opts.oauth, {
        codeChallenge: pkce.challenge,
        scope: SCOPE,
        redirectUri: OOB_REDIRECT_URI,
        state,
    })
    open(url)
    const code = (await opts.promptForCode(url)).trim()
    if (!code) throw new Error('No code entered — aborting.')
    return exchangeCode(opts.oauth, {
        code,
        codeVerifier: pkce.verifier,
        redirectUri: OOB_REDIRECT_URI,
    })
}
