import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'
import {
  createEmptyTableMarkdown,
  findTableBlocks,
  formatTableMarkdown,
  TABLE_LIMITS,
  validTableDimensions,
} from './model'

function state(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
}

describe('table model', () => {
  it('recognises supported GFM tables and preserves inline Markdown, escapes, alignment, indentation, and source ranges', () => {
    const doc = '  | Name | Notes |\n  | :--- | :---: |\n  | **Ada** | `a\\|b` |'
    const [table] = findTableBlocks(state(doc))

    expect(table.rows).toEqual([['Name', 'Notes'], ['**Ada**', '`a|b`']])
    expect(table.alignments).toEqual(['left', 'center'])
    expect(table.indent).toBe('  ')
    expect(doc.slice(table.cellRanges[1][1].from, table.cellRanges[1][1].to)).toBe('`a\\|b`')
    expect(formatTableMarkdown(table)).toBe(doc)
  })

  it('does not turn code fences, quotes, lists, incomplete syntax, or ragged rows into mutable widgets', () => {
    const doc = [
      '```md', '| A | B |', '| --- | --- |', '| 1 | 2 |', '```', '',
      '> | A | B |', '> | --- | --- |', '> | 1 | 2 |', '',
      '- | A | B |', '  | --- | --- |', '  | 1 | 2 |', '',
      '| A | B |', '| --- | --- |', '| 1 |', '',
      '| unfinished |',
    ].join('\n')

    expect(findTableBlocks(state(doc))).toEqual([])
  })

  it('keeps oversized parser-recognised tables in source mode', () => {
    const columns = Array(TABLE_LIMITS.maxColumns + 1).fill('A')
    const header = `| ${columns.join(' | ')} |`
    const delimiter = `| ${columns.map(() => '---').join(' | ')} |`
    const tooManyRows = Array(TABLE_LIMITS.maxBodyRows + 1).fill('| 1 | 2 |')

    expect(findTableBlocks(state([header, delimiter, header].join('\n')))).toEqual([])
    expect(findTableBlocks(state(['| A | B |', '| --- | --- |', ...tooManyRows].join('\n')))).toEqual([])
  })

  it('validates dimensions before allocation and creates header-only tables only when requested', () => {
    expect(validTableDimensions(1, 0)).toBe(true)
    expect(validTableDimensions(TABLE_LIMITS.maxColumns + 1, 1)).toBe(false)
    expect(validTableDimensions(2, TABLE_LIMITS.maxBodyRows + 1)).toBe(false)
    expect(validTableDimensions(1.5, 1)).toBe(false)
    expect(createEmptyTableMarkdown(2, 0)).toBe('|  |  |\n| --- | --- |')
    expect(() => createEmptyTableMarkdown(0, 1)).toThrow(RangeError)
  })
})
