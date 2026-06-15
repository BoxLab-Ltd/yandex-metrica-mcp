import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { TokenSet } from './oauth.js'

/**
 * Resolve where the token cache lives. Honors `YANDEX_METRIKA_TOKEN_FILE`, then
 * `XDG_CONFIG_HOME`, then `~/.config/yandex-metrica-mcp/token.json`.
 */
export function defaultTokenPath(env: NodeJS.ProcessEnv = process.env): string {
    const override = env.YANDEX_METRIKA_TOKEN_FILE?.trim()
    if (override) return override
    const xdg = env.XDG_CONFIG_HOME?.trim()
    const base = xdg && xdg.length > 0 ? xdg : join(homedir(), '.config')
    return join(base, 'yandex-metrica-mcp', 'token.json')
}

export interface TokenStore {
    read(): TokenSet | null
    write(tokens: TokenSet): void
    path: string
}

/** A token store backed by a single JSON file with `0600` permissions. */
export function createFileTokenStore(
    path: string = defaultTokenPath(),
): TokenStore {
    return {
        path,
        read(): TokenSet | null {
            if (!existsSync(path)) return null
            try {
                const json = JSON.parse(readFileSync(path, 'utf8')) as unknown
                if (
                    typeof json === 'object' &&
                    json !== null &&
                    typeof (json as TokenSet).accessToken === 'string' &&
                    typeof (json as TokenSet).expiresAt === 'number'
                ) {
                    return json as TokenSet
                }
                return null
            } catch {
                return null
            }
        },
        write(tokens: TokenSet): void {
            const dir = dirname(path)
            mkdirSync(dir, { recursive: true, mode: 0o700 })
            // Harden the leaf dir even if it pre-existed under a looser umask.
            chmodSync(dir, 0o700)
            writeFileSync(path, `${JSON.stringify(tokens, null, 2)}\n`, {
                mode: 0o600,
            })
            // Ensure 0600 even if the file already existed with looser perms.
            chmodSync(path, 0o600)
        },
    }
}
