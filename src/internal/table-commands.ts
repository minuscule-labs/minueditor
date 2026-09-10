import { EditorSelection } from '@codemirror/state'
import { EditorView, type EditorView as EditorViewType } from '@codemirror/view'
import {
  createEmptyTableMarkdown,
  escapeTableCell,
  findTableBlocks,
  formatTableMarkdown,
  getTableBlockByStart,
  TABLE_LIMITS,
  validTableDimensions,
  type TableAlignment,
  type TableBlock,
} from '../extensions/tables/model'
import { setActiveTable } from '../extensions/tables/state'
import { focusElementWithoutScroll } from './widget-navigation'

/** A target is valid only for the exact table instance rendered to the user. */
export type TableCellTarget = {
  blockFrom: number
  blockTo: number
  rowIndex: number
  colIndex: number
}

function canEdit(view: EditorViewType): boolean {
  return view.state.facet(EditorView.editable)
}

function resolveTarget(view: EditorViewType, target: TableCellTarget): TableBlock | null {
  if (!canEdit(view) || !Number.isInteger(target.rowIndex) || !Number.isInteger(target.colIndex)) return null
  const block = getTableBlockByStart(view.state, target.blockFrom)
  if (!block || block.to !== target.blockTo) return null
  if (!block.rows[target.rowIndex] || block.rows[target.rowIndex][target.colIndex] === undefined) return null
  return block
}

function validRange(start: number, end: number, maximum: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end < maximum
}

function applyTableBlockUpdate(
  view: EditorViewType,
  block: TableBlock,
  nextBlock: TableBlock | null,
  nextSelection = EditorSelection.cursor(block.from),
): void {
  view.dispatch({
    changes: { from: block.from, to: block.to, insert: nextBlock ? formatTableMarkdown(nextBlock) : '' },
    effects: [setActiveTable.of(nextBlock ? block.from : null), view.scrollSnapshot()],
    selection: nextSelection,
    userEvent: 'input.table',
  })
}

export function focusTableCell(view: EditorViewType, target: Pick<TableCellTarget, 'blockFrom' | 'rowIndex' | 'colIndex'>): void {
  requestAnimationFrame(() => {
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
  return { blockFrom: block.from, blockTo: block.to, rowIndex, colIndex }
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
    selection: EditorSelection.cursor(block.from),
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
  applyTableBlockUpdate(view, block, { ...block, rows, alignments })
  focusTableCell(view, { blockFrom: block.from, rowIndex: target.rowIndex, colIndex: insertIndex })
  return true
}

export function insertTableRow(view: EditorViewType, target: TableCellTarget, side: 'above' | 'below'): boolean {
  const block = resolveTarget(view, target)
  if (!block || block.rows.length - 1 >= TABLE_LIMITS.maxBodyRows) return false
  const insertIndex = side === 'above' ? target.rowIndex : target.rowIndex + 1
  const rows = block.rows.map((row) => [...row])
  rows.splice(insertIndex, 0, Array(block.rows[0].length).fill(''))
  applyTableBlockUpdate(view, block, { ...block, rows })
  focusTableCell(view, { blockFrom: block.from, rowIndex: insertIndex, colIndex: 0 })
  return true
}

/** Destructive header/last-column removal awaits its explicit Phase 2 contract. */
export function removeTableColumn(view: EditorViewType, target: TableCellTarget): boolean {
  const block = resolveTarget(view, target)
  if (!block || block.rows[0].length <= 1) return false
  const rows = block.rows.map((row) => row.filter((_, index) => index !== target.colIndex))
  const alignments = block.alignments.filter((_, index) => index !== target.colIndex)
  applyTableBlockUpdate(view, block, { ...block, rows, alignments })
  focusTableCell(view, { blockFrom: block.from, rowIndex: target.rowIndex, colIndex: Math.min(target.colIndex, rows[0].length - 1) })
  return true
}

export function removeTableRow(view: EditorViewType, target: TableCellTarget): boolean {
  const block = resolveTarget(view, target)
  if (!block || target.rowIndex === 0 || block.rows.length <= 2) return false
  const rows = block.rows.filter((_, index) => index !== target.rowIndex)
  const rowIndex = Math.min(target.rowIndex, rows.length - 1)
  applyTableBlockUpdate(view, block, { ...block, rows })
  focusTableCell(view, { blockFrom: block.from, rowIndex, colIndex: target.colIndex })
  return true
}

export function removeTableColumnRange(view: EditorViewType, blockFrom: number, blockTo: number, colStart: number, colEnd: number): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!canEdit(view) || !block || block.to !== blockTo || !validRange(colStart, colEnd, block.rows[0].length) || colEnd - colStart + 1 >= block.rows[0].length) return false
  const rows = block.rows.map((row) => row.filter((_, index) => index < colStart || index > colEnd))
  const alignments = block.alignments.filter((_, index) => index < colStart || index > colEnd)
  applyTableBlockUpdate(view, block, { ...block, rows, alignments })
  focusTableCell(view, { blockFrom: block.from, rowIndex: 0, colIndex: Math.min(colStart, rows[0].length - 1) })
  return true
}

export function removeTableRowRange(view: EditorViewType, blockFrom: number, blockTo: number, rowStart: number, rowEnd: number): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!canEdit(view) || !block || block.to !== blockTo || !validRange(rowStart, rowEnd, block.rows.length) || rowStart === 0 || rowEnd - rowStart + 1 >= block.rows.length - 1) return false
  const rows = block.rows.filter((_, index) => index < rowStart || index > rowEnd)
  applyTableBlockUpdate(view, block, { ...block, rows })
  focusTableCell(view, { blockFrom: block.from, rowIndex: Math.min(rowStart, rows.length - 1), colIndex: 0 })
  return true
}

export function clearTableCellRange(view: EditorViewType, blockFrom: number, blockTo: number, rowStart: number, rowEnd: number, colStart: number, colEnd: number): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!canEdit(view) || !block || block.to !== blockTo || !validRange(rowStart, rowEnd, block.rows.length) || !validRange(colStart, colEnd, block.rows[0].length)) return false
  const rows = block.rows.map((row) => [...row])
  for (let row = rowStart; row <= rowEnd; row += 1) for (let col = colStart; col <= colEnd; col += 1) rows[row][col] = ''
  applyTableBlockUpdate(view, block, { ...block, rows })
  focusTableCell(view, { blockFrom: block.from, rowIndex: rowStart, colIndex: colStart })
  return true
}

export function setTableColumnAlignment(view: EditorViewType, target: TableCellTarget, alignment: TableAlignment): boolean {
  const block = resolveTarget(view, target)
  if (!block) return false
  const alignments = [...block.alignments]
  alignments[target.colIndex] = alignment
  applyTableBlockUpdate(view, block, { ...block, alignments })
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
  applyTableBlockUpdate(view, block, { ...block, rows, alignments })
  return true
}

export function deleteTable(view: EditorViewType, target: TableCellTarget): boolean {
  const block = resolveTarget(view, target)
  if (!block) return false
  applyTableBlockUpdate(view, block, null)
  return true
}
