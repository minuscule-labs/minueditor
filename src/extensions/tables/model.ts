import type { EditorState } from '@codemirror/state'

export type TableAlignment = 'left' | 'center' | 'right' | null

export type TableBlock = {
  from: number
  to: number
  startLine: number
  endLine: number
  rows: string[][]
  alignments: TableAlignment[]
}

function isTableDelimiterLine(line: string): boolean {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line)
}

function isTableDataLine(line: string): boolean {
  return /^\s*\|(?:[^|\n]*\|)+\s*$/.test(line)
}

function parseTableCells(line: string): string[] {
  return line.trim().slice(1, -1).split('|').map((cell) => cell.trim())
}

function parseAlignments(line: string): TableAlignment[] {
  return parseTableCells(line).map((cell) => {
    const trimmed = cell.trim()
    const left = trimmed.startsWith(':')
    const right = trimmed.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

function formatContentLine(cells: string[]): string {
  return `|${cells.map((cell) => ` ${cell} `).join('|')}|`
}

function formatDelimiterLine(alignments: TableAlignment[]): string {
  const cells = alignments.map((alignment) => {
    if (alignment === 'center') return ':---:'
    if (alignment === 'right') return '---:'
    if (alignment === 'left') return ':---'
    return '---'
  })
  return `| ${cells.join(' | ')} |`
}

export function findTableBlocks(state: EditorState): TableBlock[] {
  const doc = state.doc
  const blocks: TableBlock[] = []
  let lineNumber = 1

  while (lineNumber <= doc.lines - 1) {
    const headerLine = doc.line(lineNumber)
    const delimiterLine = doc.line(lineNumber + 1)

    if (!isTableDataLine(headerLine.text) || !isTableDelimiterLine(delimiterLine.text)) {
      lineNumber += 1
      continue
    }

    const rows = [parseTableCells(headerLine.text)]
    const alignments = parseAlignments(delimiterLine.text)
    let endLine = lineNumber + 1

    while (endLine < doc.lines && isTableDataLine(doc.line(endLine + 1).text)) {
      endLine += 1
      rows.push(parseTableCells(doc.line(endLine).text))
    }

    blocks.push({
      from: headerLine.from,
      to: doc.line(endLine).to,
      startLine: lineNumber,
      endLine,
      rows,
      alignments,
    })

    lineNumber = endLine + 1
  }

  return blocks
}

export function getTableBlockByStart(state: EditorState, from: number): TableBlock | null {
  for (const block of findTableBlocks(state)) {
    if (block.from === from) return block
  }
  return null
}

export function getAdjacentTableBlock(
  state: EditorState,
  pos: number,
  direction: 'up' | 'down',
): TableBlock | null {
  const doc = state.doc
  const line = doc.lineAt(pos)

  if (direction === 'down') {
    if (line.number >= doc.lines) return null
    const nextLine = doc.line(line.number + 1)
    return getTableBlockByStart(state, nextLine.from)
  }

  if (line.number <= 1) return null
  const previousLine = doc.line(line.number - 1)
  for (const block of findTableBlocks(state)) {
    if (block.endLine === previousLine.number) return block
  }
  return null
}

export function createEmptyTableMarkdown(columns = 2, bodyRows = 1): string {
  const columnCount = Math.max(1, columns)
  const rowCount = Math.max(0, bodyRows)
  return formatTableMarkdown({
    from: 0,
    to: 0,
    startLine: 0,
    endLine: 0,
    rows: [
      Array(columnCount).fill(''),
      ...Array.from({ length: rowCount }, () => Array(columnCount).fill('')),
    ],
    alignments: Array(columnCount).fill(null),
  })
}

export function formatTableMarkdown(block: TableBlock): string {
  const lines = [formatContentLine(block.rows[0]), formatDelimiterLine(block.alignments)]
  for (const row of block.rows.slice(1)) {
    lines.push(formatContentLine(row))
  }
  return lines.join('\n')
}
