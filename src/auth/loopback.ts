import { createServer, type Server } from 'node:http'

const HOST = '127.0.0.1'
const DEFAULT_TIMEOUT_MS = 300_000

export interface LoopbackListener {
    /** The exact redirect_uri to register with Yandex and send to /authorize. */
    redirectUri: string
    /** Resolves with the authorization code once the browser hits the callback. */
    code: Promise<string>
    /** Stop listening (idempotent). */
    close(): void
}

export interface LoopbackOptions {
    port: number
    /** The `state` value we sent; the redirect must echo it back. */
    state: string
    path?: string
    timeoutMs?: number
}

const SUCCESS_HTML =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>Signed in</title></head>` +
    `<body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem;color:#111">` +
    `<h2>&#10003; Signed in to Yandex Metrica</h2>` +
    `<p>You can close this tab and return to your app.</p></body></html>`

function escapeHtml(s: string): string {
    return s.replace(
        /[&<>"]/g,
        c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
    )
}

function errorHtml(message: string): string {
    return (
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<title>Sign-in failed</title></head>` +
        `<body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem;color:#111">` +
        `<h2>Sign-in failed</h2><p>${escapeHtml(message)}</p>` +
        `<p>Return to your app and try again.</p></body></html>`
    )
}

/**
 * Start a one-shot loopback HTTP server that captures the OAuth redirect on
 * 127.0.0.1. Resolves once it is listening; REJECTS if the port cannot be bound
 * (e.g. EADDRINUSE) so the caller can fall back to the out-of-band flow. The
 * returned `code` promise resolves with the authorization code once Yandex
 * redirects the browser back with a matching `state`, or rejects on a returned
 * error, a state mismatch, or a timeout.
 */
export function startLoopback(
    opts: LoopbackOptions,
): Promise<LoopbackListener> {
    const path = opts.path ?? '/callback'
    const redirectUri = `http://${HOST}:${opts.port}${path}`

    return new Promise<LoopbackListener>((resolveListener, rejectListener) => {
        let resolveCode!: (code: string) => void
        let rejectCode!: (err: Error) => void
        const code = new Promise<string>((resolve, reject) => {
            resolveCode = resolve
            rejectCode = reject
        })
        // The caller may never await `code` (e.g. after a manual close); swallow
        // the rejection so it never surfaces as an unhandled rejection.
        code.catch(() => {})

        // Holder avoids a declaration cycle: `close` (used by the callbacks
        // below) reads server/timer through it, and they are filled in after.
        const held: {
            server?: Server
            timer?: ReturnType<typeof setTimeout>
            closed: boolean
        } = { closed: false }
        const close = (): void => {
            if (held.closed) return
            held.closed = true
            if (held.timer) clearTimeout(held.timer)
            held.server?.close()
        }

        held.timer = setTimeout(() => {
            rejectCode(new Error('Timed out waiting for the Yandex redirect.'))
            close()
        }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)

        held.server = createServer((req, res) => {
            const url = new URL(req.url ?? '/', redirectUri)
            if (url.pathname !== path) {
                res.writeHead(404).end()
                return
            }
            const fail = (message: string): void => {
                res.writeHead(400, {
                    'Content-Type': 'text/html; charset=utf-8',
                }).end(errorHtml(message))
                rejectCode(new Error(message))
                close()
            }
            const returnedError = url.searchParams.get('error')
            if (returnedError) {
                fail(`Yandex returned an error: ${returnedError}`)
                return
            }
            if (url.searchParams.get('state') !== opts.state) {
                fail('State mismatch — the redirect did not match this request.')
                return
            }
            const authCode = url.searchParams.get('code')
            if (!authCode) {
                fail('The redirect did not include an authorization code.')
                return
            }
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
            }).end(SUCCESS_HTML)
            resolveCode(authCode)
            close()
        })

        held.server.on('error', (err: Error) => {
            if (held.timer) clearTimeout(held.timer)
            rejectListener(err)
        })
        held.server.listen(opts.port, HOST, () => {
            resolveListener({ redirectUri, code, close })
        })
    })
}
