import { TABLE_LIMITS } from './model'

export type TableClipboardParseResult =
  | { status: 'not-tabular' | 'empty' | 'invalid' | 'multiline-cell' | 'oversize' }
  | { status: 'valid'; cells: string[][] }

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/**
 * Parses spreadsheet TSV without flattening quoted values. Markdown table
 * cells cannot represent embedded newlines, so those are rejected explicitly.
 */
export function parseTableClipboard(text: string): TableClipboardParseResult {
  if (!text) return { status: 'empty' }
  if (byteLength(text) > TABLE_LIMITS.maxClipboardBytes) return { status: 'oversize' }
  if (!text.includes('\t')) return { status: 'not-tabular' }

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let closedQuote = false

  const finishCell = () => {
    row.push(cell)
    cell = ''
    closedQuote = false
  }
  const finishRow = () => {
    finishCell()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
          closedQuote = true
        }
      } else if (character === '\n' || character === '\r') {
        return { status: 'multiline-cell' }
      } else {
        cell += character
      }
      continue
    }

    if (closedQuote && character !== '\t' && character !== '\n' && character !== '\r') {
      return { status: 'invalid' }
    }
    if (character === '\t') {
      finishCell()
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      finishRow()
    } else if (character === '"' && cell === '') {
      quoted = true
    } else {
      cell += character
    }
  }

  if (quoted) return { status: 'invalid' }
  if (cell || row.length > 0) finishRow()
  if (rows.length === 0) return { status: 'empty' }
  const width = rows[0].length
  if (width < 2 || rows.some((current) => current.length !== width)) return { status: 'invalid' }
  return { status: 'valid', cells: rows }
}
