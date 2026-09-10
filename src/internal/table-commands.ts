import { EditorSelection } from '@codemirror/state'
import { EditorView, type EditorView as EditorViewType } from '@codemirror/view'
import {
  createEmptyTableMarkdown,
  escapeTableCell,
  findTableBlocks,
  formatTableMarkdown,
  getTableBlockByStart,
  splitTableCells,
  TABLE_LIMITS,
  validTableDimensions,
  type TableAlignment,
  type TableBlock,
} from '../extensions/tables/model'
import { activeTableField, setActiveTable } from '../extensions/tables/state'
import { focusElementWithoutScroll } from './widget-navigation'

/** A target is valid only for the exact table instance rendered to the user. */
export type TableBlockTarget = {
  blockFrom: number
  blockTo: number
  /** Exact rendered source, preventing equal-length replacement races. */
  source: string
}

export type TableCellTarget = TableBlockTarget & {
  rowIndex: number
  colIndex: number
}

function canEdit(view: EditorViewType): boolean {
  return view.state.facet(EditorView.editable)
}

function resolveBlockTarget(view: EditorViewType, target: TableBlockTarget): TableBlock | null {
  if (!canEdit(view)) return null
  const block = getTableBlockByStart(view.state, target.blockFrom)
  return block && block.to === target.blockTo && block.source === target.source ? block : null
}

function resolveTarget(view: EditorViewType, target: TableCellTarget): TableBlock | null {
  if (!Number.isInteger(target.rowIndex) || !Number.isInteger(target.colIndex)) return null
  const block = resolveBlockTarget(view, target)
  if (!block || !block.rows[target.rowIndex] || block.rows[target.rowIndex][target.colIndex] === undefined) return null
  return block
}

function validRange(start: number, end: number, maximum: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end < maximum
}

function sourceCellSelection(
  block: TableBlock,
  markdown: string,
  target: { rowIndex: number; colIndex: number },
) {
  const lineIndex = target.rowIndex === 0 ? 0 : target.rowIndex + 1
  const lines = markdown.split('\n')
  const line = lines[lineIndex]
  if (line == null) return EditorSelection.cursor(block.from)
  const lineFrom = block.from + lines.slice(0, lineIndex).reduce((offset, current) => offset + current.length + 1, 0)
  const range = splitTableCells(line, lineFrom)?.ranges[target.colIndex]
  return EditorSelection.cursor(range?.from ?? block.from)
}

function applyTableBlockUpdate(
  view: EditorViewType,
  block: TableBlock,
  nextBlock: TableBlock | null,
  sourceTarget?: { rowIndex: number; colIndex: number },
): void {
  const markdown = nextBlock ? formatTableMarkdown(nextBlock) : ''
  view.dispatch({
    changes: { from: block.from, to: block.to, insert: markdown },
    effects: [setActiveTable.of(nextBlock ? block.from : null), view.scrollSnapshot()],
    selection: nextBlock && sourceTarget
      ? sourceCellSelection(block, markdown, sourceTarget)
      : EditorSelection.cursor(block.from),
    userEvent: 'input.table',
  })
}

const tableCellFocusTokens = new WeakMap<EditorViewType, number>()

/** Focus only the still-current widget; deferred callbacks must never steal focus. */
export function focusTableCell(view: EditorViewType, target: Pick<TableCellTarget, 'blockFrom' | 'rowIndex' | 'colIndex'>): void {
  const token = (tableCellFocusTokens.get(view) ?? 0) + 1
  const document = view.state.doc
  tableCellFocusTokens.set(view, token)

  requestAnimationFrame(() => {
    if (
      tableCellFocusTokens.get(view) !== token ||
      view.state.doc !== document ||
      !view.dom.isConnected ||
      !view.state.facet(EditorView.editable) ||
      view.state.field(activeTableField, false) !== target.blockFrom
    ) return
    const widget = view.dom.querySelector(`.me-table-widget[data-table-from="${target.blockFrom}"]`) as HTMLElement | null
    const input = widget?.querySelector(`[data-row-index="${target.rowIndex}"][data-col-index="${target.colIndex}"]`) as HTMLInputElement | null
    if (!input) return
    focusElementWithoutScroll(input)
    input.setSelectionRange(input.value.length, input.value.length)
  })
}

export function insertTableAt(
  view: EditorViewType,
  { from, to = from, columns = 2, bodyRows = 1, prefix = '', suffix = '' }: { from: number; to?: number; columns?: number; bodyRows?: number; prefix?: string; suffix?: string },
): boolean {
  if (!canEdit(view) || !validTableDimensions(columns, bodyRows) || !Number.isInteger(from) || !Number.isInteger(to)) return false
  if (from < 0 || to < from || to > view.state.doc.length) return false
  const table = createEmptyTableMarkdown(columns, bodyRows)
  const blockFrom = from + prefix.length
  view.dispatch({
    changes: { from, to, insert: `${prefix}${table}${suffix}` },
    effects: setActiveTable.of(blockFrom),
    selection: EditorSelection.cursor(blockFrom),
    scrollIntoView: true,
    userEvent: 'input.table',
  })
  focusTableCell(view, { blockFrom, rowIndex: 0, colIndex: 0 })
  return true
}

export function tableCellTargetAtSelection(view: EditorViewType): TableCellTarget | null {
  const selection = view.state.selection.main
  if (!selection.empty) return null
  const block = findTableBlocks(view.state).find((candidate) => selection.from >= candidate.from && selection.from <= candidate.to)
  if (!block) return null
  const line = view.state.doc.lineAt(selection.from)
  if (line.number === block.startLine + 1) return null
  const rowIndex = line.number === block.startLine ? 0 : line.number - block.startLine - 1
  const ranges = block.cellRanges[rowIndex]
  if (!ranges) return null
  const colIndex = ranges.findIndex((range) => selection.from <= range.rawTo)
  if (colIndex < 0) return null
  return { blockFrom: block.from, blockTo: block.to, source: block.source, rowIndex, colIndex }
}

export function updateTableCell(view: EditorViewType, target: TableCellTarget, value: string): boolean {
  const block = resolveTarget(view, target)
  const range = block?.cellRanges[target.rowIndex]?.[target.colIndex]
  if (!block || !range) return false
  // Local typing replaces just the authored cell content. This preserves cell
  // edge whitespace, delimiter style, and every unaffected source range.
  view.dispatch({
    changes: { from: range.rawFrom, to: range.rawTo, insert: ` ${escapeTableCell(value.trim())} ` },
    effects: [setActiveTable.of(block.from), view.scrollSnapshot()],
    selection: EditorSelection.cursor(range.from),
    userEvent: 'input.table',
  })
  return true
}

export function insertTableColumn(view: EditorViewType, target: TableCellTarget, side: 'left' | 'right'): boolean {
  const block = resolveTarget(view, target)
  if (!block || block.rows[0].length >= TABLE_LIMITS.maxColumns) return false
  const insertIndex = side === 'left' ? target.colIndex : target.colIndex + 1
  const rows = block.rows.map((row) => { const next = [...row]; next.splice(insertIndex, 0, ''); return next })
  const alignments = [...block.alignments]
  alignments.splice(insertIndex, 0, null)
  applyTableBlockUpdate(view, block, { ...block, rows, alignments }, { rowIndex: target.rowIndex, colIndex: insertIndex })
  focusTableCell(view, { blockFrom: block.from, rowIndex: target.rowIndex, colIndex: insertIndex })
  return true
}

export function insertTableRow(view: EditorViewType, target: TableCellTarget, side: 'above' | 'below'): boolean {
  const block = resolveTarget(view, target)
  // A table has one header. Inserting above it would silently reclassify the
  // previous header as a body row, so leave that decision to a later contract.
  if (!block || (target.rowIndex === 0 && side === 'above') || block.rows.length - 1 >= TABLE_LIMITS.maxBodyRows) return false
  const insertIndex = side === 'above' ? target.rowIndex : target.rowIndex + 1
  const rows = block.rows.map((row) => [...row])
  rows.splice(insertIndex, 0, Array(block.rows[0].length).fill(''))
  applyTableBlockUpdate(view, block, { ...block, rows }, { rowIndex: insertIndex, colIndex: 0 })
  focusTableCell(view, { blockFrom: block.from, rowIndex: insertIndex, colIndex: 0 })
  return true
}

/** Destructive header/last-column removal awaits its explicit Phase 2 contract. */
export function removeTableColumn(view: EditorViewType, target: TableCellTarget): boolean {
  const block = resolveTarget(view, target)
  if (!block || block.rows[0].length <= 1 || block.rows.some((row) => row[target.colIndex].length > 0)) return false
  const rows = block.rows.map((row) => row.filter((_, index) => index !== target.colIndex))
  const alignments = block.alignments.filter((_, index) => index !== target.colIndex)
  const colIndex = Math.min(target.colIndex, rows[0].length - 1)
  applyTableBlockUpdate(view, block, { ...block, rows, alignments }, { rowIndex: target.rowIndex, colIndex })
  focusTableCell(view, { blockFrom: block.from, rowIndex: target.rowIndex, colIndex })
  return true
}

export function removeTableRow(view: EditorViewType, target: TableCellTarget): boolean {
  const block = resolveTarget(view, target)
  if (!block || target.rowIndex === 0 || block.rows.length <= 2 || block.rows[target.rowIndex].some((cell) => cell.length > 0)) return false
  const rows = block.rows.filter((_, index) => index !== target.rowIndex)
  const rowIndex = Math.min(target.rowIndex, rows.length - 1)
  applyTableBlockUpdate(view, block, { ...block, rows }, { rowIndex, colIndex: target.colIndex })
  focusTableCell(view, { blockFrom: block.from, rowIndex, colIndex: target.colIndex })
  return true
}

export function removeTableColumnRange(view: EditorViewType, target: TableBlockTarget, colStart: number, colEnd: number): boolean {
  const block = resolveBlockTarget(view, target)
  if (!block || !validRange(colStart, colEnd, block.rows[0].length) || colEnd - colStart + 1 >= block.rows[0].length || block.rows.some((row) => row.slice(colStart, colEnd + 1).some((cell) => cell.length > 0))) return false
  const rows = block.rows.map((row) => row.filter((_, index) => index < colStart || index > colEnd))
  const alignments = block.alignments.filter((_, index) => index < colStart || index > colEnd)
  const colIndex = Math.min(colStart, rows[0].length - 1)
  applyTableBlockUpdate(view, block, { ...block, rows, alignments }, { rowIndex: 0, colIndex })
  focusTableCell(view, { blockFrom: block.from, rowIndex: 0, colIndex })
  return true
}

export function removeTableRowRange(view: EditorViewType, target: TableBlockTarget, rowStart: number, rowEnd: number): boolean {
  const block = resolveBlockTarget(view, target)
  if (!block || !validRange(rowStart, rowEnd, block.rows.length) || rowStart === 0 || rowEnd - rowStart + 1 >= block.rows.length - 1 || block.rows.slice(rowStart, rowEnd + 1).some((row) => row.some((cell) => cell.length > 0))) return false
  const rows = block.rows.filter((_, index) => index < rowStart || index > rowEnd)
  const rowIndex = Math.min(rowStart, rows.length - 1)
  applyTableBlockUpdate(view, block, { ...block, rows }, { rowIndex, colIndex: 0 })
  focusTableCell(view, { blockFrom: block.from, rowIndex, colIndex: 0 })
  return true
}

export function clearTableCellRange(view: EditorViewType, target: TableBlockTarget, rowStart: number, rowEnd: number, colStart: number, colEnd: number): boolean {
  const block = resolveBlockTarget(view, target)
  if (!block || !validRange(rowStart, rowEnd, block.rows.length) || !validRange(colStart, colEnd, block.rows[0].length)) return false
  const rows = block.rows.map((row) => [...row])
  for (let row = rowStart; row <= rowEnd; row += 1) for (let col = colStart; col <= colEnd; col += 1) rows[row][col] = ''
  applyTableBlockUpdate(view, block, { ...block, rows }, { rowIndex: rowStart, colIndex: colStart })
  focusTableCell(view, { blockFrom: block.from, rowIndex: rowStart, colIndex: colStart })
  return true
}

export function setTableColumnAlignment(view: EditorViewType, target: TableCellTarget, alignment: TableAlignment): boolean {
  const block = resolveTarget(view, target)
  if (!block) return false
  const alignments = [...block.alignments]
  alignments[target.colIndex] = alignment
  applyTableBlockUpdate(view, block, { ...block, alignments }, { rowIndex: target.rowIndex, colIndex: target.colIndex })
  return true
}

/** Growth is safe now; shrinking is intentionally deferred until confirmation UI exists. */
export function resizeTable(view: EditorViewType, target: TableCellTarget, columns: number, bodyRows: number): boolean {
  const block = resolveTarget(view, target)
  if (!block || !validTableDimensions(columns, bodyRows)) return false
  const currentColumns = block.rows[0].length
  const currentBodyRows = block.rows.length - 1
  if (columns < currentColumns || bodyRows < currentBodyRows || (columns === currentColumns && bodyRows === currentBodyRows)) return false
  const rows = block.rows.map((row) => [...row, ...Array(Math.max(0, columns - currentColumns)).fill('')])
  while (rows.length - 1 < bodyRows) rows.push(Array(columns).fill(''))
  const alignments = [...block.alignments, ...Array(Math.max(0, columns - currentColumns)).fill(null)]
  applyTableBlockUpdate(view, block, { ...block, rows, alignments }, { rowIndex: target.rowIndex, colIndex: target.colIndex })
  return true
}

export function deleteTable(view: EditorViewType, target: TableCellTarget): boolean {
  const block = resolveTarget(view, target)
  if (!block) return false
  applyTableBlockUpdate(view, block, null)
  view.focus()
  return true
}
