import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

export type TableAlignment = 'left' | 'center' | 'right' | null

export const TABLE_LIMITS = {
  maxColumns: 50,
  maxBodyRows: 200,
  maxClipboardBytes: 1_048_576,
} as const

export type TableCellRange = { from: number; to: number; rawFrom: number; rawTo: number }

export type TableBlock = {
  from: number
  to: number
  startLine: number
  endLine: number
  /** Header is row zero; all supported rows have the same column count. */
  rows: string[][]
  alignments: TableAlignment[]
  /** Source ranges exclude cell-edge whitespace and Markdown pipes. */
  cellRanges: TableCellRange[][]
  indent: string
}

function isTableDelimiterLine(line: string): boolean {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line)
}

function isTableDataLine(line: string): boolean {
  return /^\s*\|(?:[^|\n]*\|)+\s*$/.test(line)
}

function splitTableCells(line: string, lineFrom = 0): { cells: string[]; ranges: TableCellRange[] } | null {
  const firstPipe = line.indexOf('|')
  const lastPipe = line.lastIndexOf('|')
  if (firstPipe < 0 || firstPipe === lastPipe || line.slice(0, firstPipe).trim() !== '' || line.slice(lastPipe + 1).trim() !== '') return null

  const cells: string[] = []
  const ranges: TableCellRange[] = []
  let cellStart = firstPipe + 1
  let escaped = false
  for (let index = firstPipe + 1; index <= lastPipe; index += 1) {
    const character = line[index]
    if (index !== lastPipe && (character !== '|' || escaped)) {
      escaped = character === '\\' ? !escaped : false
      continue
    }

    const raw = line.slice(cellStart, index)
    const leading = raw.match(/^\s*/)?.[0].length ?? 0
    const trailing = raw.match(/\s*$/)?.[0].length ?? 0
    const contentEnd = Math.max(cellStart + leading, index - trailing)
    cells.push(raw.trim().replace(/\\\|/g, '|'))
    ranges.push({
      from: lineFrom + cellStart + leading,
      to: lineFrom + contentEnd,
      rawFrom: lineFrom + cellStart,
      rawTo: lineFrom + index,
    })
    cellStart = index + 1
    escaped = false
  }

  return { cells, ranges }
}

function parseAlignments(line: string): TableAlignment[] | null {
  const parsed = splitTableCells(line)
  if (!parsed) return null
  return parsed.cells.map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

export function escapeTableCell(cell: string): string {
  let escaped = ''
  for (const character of cell) {
    if (character === '|') {
      let backslashes = 0
      for (let index = escaped.length - 1; index >= 0 && escaped[index] === '\\'; index -= 1) backslashes += 1
      if (backslashes % 2 === 0) escaped += '\\'
    }
    escaped += character
  }
  return escaped
}

function formatContentLine(cells: string[], indent = ''): string {
  return `${indent}|${cells.map((cell) => ` ${escapeTableCell(cell)} `).join('|')}|`
}

function formatDelimiterLine(alignments: TableAlignment[], indent = ''): string {
  const cells = alignments.map((alignment) => {
    if (alignment === 'center') return ':---:'
    if (alignment === 'right') return '---:'
    if (alignment === 'left') return ':---'
    return '---'
  })
  return `${indent}| ${cells.join(' | ')} |`
}

function isRootTable(node: { parent: { name: string } | null }): boolean {
  return node.parent?.name === 'Document'
}

function tableBlockAt(state: EditorState, from: number, to: number): TableBlock | null {
  const { doc } = state
  const startLine = doc.lineAt(from).number
  const syntaxEndLine = doc.lineAt(to).number
  if (syntaxEndLine <= startLine) return null

  const header = doc.line(startLine)
  const delimiter = doc.line(startLine + 1)
  if (!isTableDataLine(header.text) || !isTableDelimiterLine(delimiter.text)) return null

  const parsedHeader = splitTableCells(header.text, header.from)
  const alignments = parseAlignments(delimiter.text)
  if (!parsedHeader || !alignments || parsedHeader.cells.length === 0 || alignments.length !== parsedHeader.cells.length) return null

  const rows = [parsedHeader.cells]
  const cellRanges = [parsedHeader.ranges]
  let endLine = startLine + 1
  for (let lineNumber = startLine + 2; lineNumber <= syntaxEndLine; lineNumber += 1) {
    const line = doc.line(lineNumber)
    if (!isTableDataLine(line.text)) break
    const parsed = splitTableCells(line.text, line.from)
    // A ragged row is a safe source fallback, rather than a partial widget.
    if (!parsed || parsed.cells.length !== parsedHeader.cells.length) return null
    rows.push(parsed.cells)
    cellRanges.push(parsed.ranges)
    endLine = lineNumber
  }

  const indent = header.text.match(/^(\s*)/)?.[1] ?? ''
  return { from: header.from, to: doc.line(endLine).to, startLine, endLine, rows, alignments, cellRanges, indent }
}

/**
 * Finds only parser-recognised, top-level GFM tables. Table-like text in code
 * fences, block quotes, lists, incomplete tables, and ragged rows stays source
 * text so widget commands can never rewrite it incorrectly.
 */
export function findTableBlocks(state: EditorState): TableBlock[] {
  const blocks: TableBlock[] = []
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table' || !isRootTable(node.node)) return
      const block = tableBlockAt(state, node.from, node.to)
      if (block) blocks.push(block)
    },
  })
  return blocks
}

export function getTableBlockByStart(state: EditorState, from: number): TableBlock | null {
  return findTableBlocks(state).find((block) => block.from === from) ?? null
}

export function getAdjacentTableBlock(state: EditorState, pos: number, direction: 'up' | 'down'): TableBlock | null {
  const line = state.doc.lineAt(pos)
  if (direction === 'down') {
    if (line.number >= state.doc.lines) return null
    return getTableBlockByStart(state, state.doc.line(line.number + 1).from)
  }
  if (line.number <= 1) return null
  const previousLine = state.doc.line(line.number - 1)
  return findTableBlocks(state).find((block) => block.endLine === previousLine.number) ?? null
}

export function validTableDimensions(columns: number, bodyRows: number): boolean {
  return Number.isInteger(columns) && Number.isInteger(bodyRows) && columns >= 1 && bodyRows >= 0 && columns <= TABLE_LIMITS.maxColumns && bodyRows <= TABLE_LIMITS.maxBodyRows
}

export function createEmptyTableMarkdown(columns = 2, bodyRows = 1): string {
  if (!validTableDimensions(columns, bodyRows)) {
    throw new RangeError(`Table dimensions must be 1-${TABLE_LIMITS.maxColumns} columns and 0-${TABLE_LIMITS.maxBodyRows} body rows`)
  }
  return formatTableMarkdown({
    rows: [Array(columns).fill(''), ...Array.from({ length: bodyRows }, () => Array(columns).fill(''))],
    alignments: Array(columns).fill(null),
    indent: '',
  })
}

export function formatTableMarkdown(block: Pick<TableBlock, 'rows' | 'alignments' | 'indent'>): string {
  const lines = [formatContentLine(block.rows[0], block.indent), formatDelimiterLine(block.alignments, block.indent)]
  for (const row of block.rows.slice(1)) lines.push(formatContentLine(row, block.indent))
  return lines.join('\n')
}
