import { randomBytes } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { openBrowser } from '../../auth/browser.js'
import { startLoopback } from '../../auth/loopback.js'
import {
    buildAuthorizeUrl,
    exchangeCode,
    OOB_REDIRECT_URI,
    type OAuthClientConfig,
} from '../../auth/oauth.js'
import { generatePkce } from '../../auth/pkce.js'
import type { ToolContext } from '../context.js'
import { errorResult, toToolResult } from '../format.js'

const SCOPE = 'metrika:read'
// Loopback path blocks this tool call until the browser round-trips; bound it
// so a never-completed approval fails cleanly instead of hanging forever.
const LOOPBACK_WAIT_MS = 120_000

function base64Url(buf: Buffer): string {
    return buf
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

function oauthOf(ctx: ToolContext): OAuthClientConfig {
    return {
        clientId: ctx.config.oauthClientId,
        clientSecret: ctx.config.oauthClientSecret,
        baseUrl: ctx.config.oauthBaseUrl,
    }
}

// A copy-paste sign-in awaiting its code. In-process, single-user, so a lone
// module-level slot is enough; a new `login` overwrites any stale attempt.
interface PendingLogin {
    verifier: string
    redirectUri: string
    oauth: OAuthClientConfig
}
let pending: PendingLogin | null = null

const SIGNED_IN = {
    signed_in: true,
    message: 'Signed in to Yandex Metrica. You can run reports now.',
}

export function registerLogin(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
        'login',
        {
            title: 'Sign in to Yandex Metrica',
            description:
                'Sign in to Yandex Metrica from here. Opens your browser to approve access; the code returns ' +
                'automatically over a local redirect, so this usually finishes in one call. If the local port is ' +
                'unavailable it returns a URL to approve and you then call submit_code with the code Yandex shows. ' +
                'Run this once (the token lasts ~1 year); needed before reports if you are not signed in yet.',
            inputSchema: {
                oob: z
                    .boolean()
                    .optional()
                    .describe(
                        'Force the copy-paste flow instead of the automatic local redirect.',
                    ),
            },
            annotations: {
                title: 'Sign in to Yandex Metrica',
                readOnlyHint: false,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                const oauth = oauthOf(ctx)
                const pkce = generatePkce()
                const state = base64Url(randomBytes(16))

                if (!args.oob) {
                    let listener
                    try {
                        listener = await startLoopback({
                            port: ctx.config.oauthLoopbackPort,
                            state,
                            timeoutMs: LOOPBACK_WAIT_MS,
                        })
                    } catch {
                        listener = null
                    }
                    if (listener) {
                        const url = buildAuthorizeUrl(oauth, {
                            codeChallenge: pkce.challenge,
                            scope: SCOPE,
                            redirectUri: listener.redirectUri,
                            state,
                        })
                        openBrowser(url)
                        try {
                            const code = await listener.code
                            const tokens = await exchangeCode(oauth, {
                                code,
                                codeVerifier: pkce.verifier,
                                redirectUri: listener.redirectUri,
                            })
                            ctx.onLogin(tokens)
                            pending = null
                            return toToolResult({ ...SIGNED_IN })
                        } finally {
                            listener.close()
                        }
                    }
                }

                // Copy-paste fallback: hand back the URL and await submit_code.
                const url = buildAuthorizeUrl(oauth, {
                    codeChallenge: pkce.challenge,
                    scope: SCOPE,
                    redirectUri: OOB_REDIRECT_URI,
                    state,
                })
                pending = {
                    verifier: pkce.verifier,
                    redirectUri: OOB_REDIRECT_URI,
                    oauth,
                }
                openBrowser(url)
                return toToolResult({
                    signed_in: false,
                    authorize_url: url,
                    next: 'Open authorize_url, approve access, then call submit_code with the code Yandex shows you.',
                })
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}

export function registerSubmitCode(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
        'submit_code',
        {
            title: 'Submit the Yandex sign-in code',
            description:
                'Complete a copy-paste sign-in started by login: pass the code Yandex showed you after you approved access.',
            inputSchema: {
                code: z
                    .string()
                    .min(1)
                    .describe(
                        'The code shown on the Yandex page after you approved access.',
                    ),
            },
            annotations: {
                title: 'Submit the Yandex sign-in code',
                readOnlyHint: false,
                openWorldHint: true,
            },
        },
        async args => {
            try {
                if (!pending) {
                    return errorResult(
                        new Error(
                            'No sign-in is in progress. Call login first, then submit_code with the code.',
                        ),
                    )
                }
                const tokens = await exchangeCode(pending.oauth, {
                    code: args.code.trim(),
                    codeVerifier: pending.verifier,
                    redirectUri: pending.redirectUri,
                })
                ctx.onLogin(tokens)
                pending = null
                return toToolResult({ ...SIGNED_IN })
            } catch (err) {
                return errorResult(err)
            }
        },
    )
}
