import { describe, expect, it } from 'bun:test'
import {
    parseTsv,
    parseTsvLine,
    rowsToObjects,
    unescapeTsvValue,
} from '../src/api/tsv.js'

describe('tsv unescaping', () => {
    it('decodes ClickHouse TabSeparated escapes', () => {
        expect(unescapeTsvValue('a\\tb')).toBe('a\tb')
        expect(unescapeTsvValue('line1\\nline2')).toBe('line1\nline2')
        expect(unescapeTsvValue('C:\\\\path')).toBe('C:\\path')
        expect(unescapeTsvValue('plain')).toBe('plain')
    })
})

describe('tsv line splitting', () => {
    it('splits on raw tabs and maps a bare \\N to empty', () => {
        expect(parseTsvLine('a\tb\t\\N')).toEqual(['a', 'b', ''])
    })

    it('keeps escaped tabs/newlines inside a field', () => {
        expect(parseTsvLine('a\\tb\tc')).toEqual(['a\tb', 'c'])
        expect(parseTsvLine('u\\nv\tw')).toEqual(['u\nv', 'w'])
    })
})

describe('parseTsv', () => {
    it('separates header from rows and drops trailing blank lines', () => {
        const { header, rows } = parseTsv('h1\th2\n1\t2\n3\t4\n\n')
        expect(header).toEqual(['h1', 'h2'])
        expect(rows).toEqual([
            ['1', '2'],
            ['3', '4'],
        ])
    })

    it('returns empty for empty input', () => {
        expect(parseTsv('')).toEqual({ header: [], rows: [] })
    })
})

describe('rowsToObjects', () => {
    it('zips a header with rows into keyed objects', () => {
        expect(rowsToObjects(['a', 'b'], [['1', '2']])).toEqual([
            { a: '1', b: '2' },
        ])
    })

    it('fills missing cells with empty strings', () => {
        expect(rowsToObjects(['a', 'b'], [['1']])).toEqual([{ a: '1', b: '' }])
    })
})
