import { TABLE_LIMITS } from './model'

export type TableClipboardParseResult =
  | { status: 'not-tabular' | 'empty' | 'invalid' | 'multiline-cell' | 'merged-cell' | 'oversize' }
  | { status: 'valid'; cells: string[][] }

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/**
 * Parses spreadsheet TSV without flattening quoted values. Markdown table
 * cells cannot represent embedded newlines, so those are rejected explicitly.
 */
export function tableCellsToTsv(cells: readonly (readonly string[])[]): string {
  return cells.map((row) => row.map((cell) => {
    const value = cell.replace(/\r\n?/g, '\n')
    return /["\t\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  }).join('\t')).join('\n')
}

/** Include a structural representation so one-column and single-cell ranges stay unambiguous. */
export function tableCellsToHtml(cells: readonly (readonly string[])[]): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r\n?|\n/g, '<br>')
  return `<table><tbody>${cells.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

const MAX_CLIPBOARD_ROWS = TABLE_LIMITS.maxBodyRows + 1
const MULTILINE_HTML_SELECTOR = 'br, section, article, header, footer, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre, table, hr'
const UNSAFE_HTML_SELECTOR = 'script, style, template, embed, iframe, object, noscript'

function singleLineHtmlCell(cell: HTMLTableCellElement): string | null {
  if (cell.querySelector(MULTILINE_HTML_SELECTOR)) return null
  let content: Element = cell
  for (;;) {
    const meaningful = Array.from(content.childNodes).filter(node =>
      node.nodeType === 1 || (node.nodeType === 3 && node.textContent?.trim()),
    )
    const child = meaningful.length === 1 ? meaningful[0] : null
    if (child?.nodeType !== 1 || !(child as Element).matches('p, div')) break
    content = child as Element
  }
  // A single paragraph (including nested wrappers) is not multiline. Multiple
  // paragraphs or mixed inline/block content cannot safely fit a Markdown cell.
  if (content.querySelector('p, div')) return null
  return (content.textContent ?? '').replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').trim()
}

function parseHtmlTableClipboard(html: string): TableClipboardParseResult {
  if (!html.trim() || typeof document === 'undefined') return { status: 'not-tabular' }
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll(UNSAFE_HTML_SELECTOR).forEach((element) => element.remove())
  const table = template.content.querySelector('table') as HTMLTableElement | null
  if (!table) return { status: 'not-tabular' }

  const rows: string[][] = []
  for (const row of Array.from(table.rows)) {
    if (rows.length >= MAX_CLIPBOARD_ROWS || row.cells.length > TABLE_LIMITS.maxColumns) {
      return { status: 'oversize' }
    }
    const cells: string[] = []
    for (const cell of Array.from(row.cells)) {
      if (cell.colSpan !== 1 || cell.rowSpan !== 1) return { status: 'merged-cell' }
      const text = singleLineHtmlCell(cell)
      if (text === null) return { status: 'multiline-cell' }
      cells.push(text)
    }
    if (cells.length > 0) rows.push(cells)
  }
  const width = rows[0]?.length ?? 0
  if (width < 1 || rows.some((row) => row.length !== width)) return { status: 'invalid' }
  return { status: 'valid', cells: rows }
}

export function parseTableClipboard(text: string, html = ''): TableClipboardParseResult {
  if (byteLength(text) + byteLength(html) > TABLE_LIMITS.maxClipboardBytes) return { status: 'oversize' }
  if (!text && !html) return { status: 'empty' }
  if (!text.includes('\t')) return parseHtmlTableClipboard(html)

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let closedQuote = false

  const finishCell = (): boolean => {
    if (row.length >= TABLE_LIMITS.maxColumns) return false
    row.push(cell)
    cell = ''
    closedQuote = false
    return true
  }
  const finishRow = (): boolean => {
    if (rows.length >= MAX_CLIPBOARD_ROWS || !finishCell()) return false
    rows.push(row)
    row = []
    return true
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
      if (!finishCell()) return { status: 'oversize' }
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      if (!finishRow()) return { status: 'oversize' }
    } else if (character === '"' && cell === '') {
      quoted = true
    } else {
      cell += character
    }
  }

  if (quoted) return { status: 'invalid' }
  if ((cell || row.length > 0) && !finishRow()) return { status: 'oversize' }
  if (rows.length === 0) return { status: 'empty' }
  const width = rows[0].length
  if (width < 1 || rows.some((current) => current.length !== width)) return { status: 'invalid' }
  return { status: 'valid', cells: rows }
}
