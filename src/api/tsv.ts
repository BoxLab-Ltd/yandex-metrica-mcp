/**
 * Parser for the TSV that the Logs API `download` endpoint returns. The format
 * is ClickHouse `TabSeparatedWithNames`: a header row of field names, then data
 * rows. Values escape special chars (tab/newline/backslash), so a raw tab is
 * always a column delimiter and a raw newline always a row delimiter — see
 * docs/API-NOTES.md. Every downloaded part carries its own header row.
 */

/** ClickHouse TabSeparated single-character escapes. */
const UNESCAPE: Record<string, string> = {
    '\\': '\\',
    "'": "'",
    '0': '\0',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
}

export function unescapeTsvValue(value: string): string {
    if (!value.includes('\\')) return value
    let out = ''
    let i = 0
    while (i < value.length) {
        const c = value.charAt(i)
        if (c === '\\' && i + 1 < value.length) {
            const next = value.charAt(i + 1)
            out += UNESCAPE[next] ?? next
            i += 2
        } else {
            out += c
            i += 1
        }
    }
    return out
}

/** Split one raw TSV line into unescaped fields. A bare `\N` marks SQL NULL → ''. */
export function parseTsvLine(line: string): string[] {
    return line.split('\t').map(f => (f === '\\N' ? '' : unescapeTsvValue(f)))
}

export interface ParsedTsv {
    header: string[]
    rows: string[][]
}

/** Parse a whole TSV part (header + rows), dropping any trailing blank lines. */
export function parseTsv(text: string): ParsedTsv {
    const lines = text.split('\n')
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    if (lines.length === 0) return { header: [], rows: [] }
    return {
        header: parseTsvLine(lines[0] ?? ''),
        rows: lines.slice(1).map(parseTsvLine),
    }
}

/** Zip header names with each row into keyed objects (model-friendly output). */
export function rowsToObjects(
    header: string[],
    rows: string[][],
): Record<string, string>[] {
    return rows.map(cells => {
        const obj: Record<string, string> = {}
        header.forEach((h, i) => {
            obj[h] = cells[i] ?? ''
        })
        return obj
    })
}
