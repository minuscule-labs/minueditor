import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import {
  formatTableMarkdown,
  getTableBlockByStart,
  type TableBlock,
} from '../extensions/tables/model'
import { setActiveTable } from '../extensions/tables/state'
import { focusElementWithoutScroll } from './widget-navigation'

export type TableCellTarget = {
  blockFrom: number
  rowIndex: number
  colIndex: number
}

function applyTableBlockUpdate(
  view: EditorView,
  block: TableBlock,
  nextBlock: TableBlock | null,
  nextSelection: EditorSelection,
): void {
  view.dispatch({
    changes: {
      from: block.from,
      to: block.to,
      insert: nextBlock ? formatTableMarkdown(nextBlock) : '',
    },
    effects: [
      setActiveTable.of(nextBlock ? block.from : null),
      view.scrollSnapshot(),
    ],
    selection: nextSelection,
  })
}

export function focusTableCell(
  view: EditorView,
  blockFrom: number,
  rowIndex: number,
  colIndex: number,
): void {
  requestAnimationFrame(() => {
    const widget = view.dom.querySelector(
      `.me-table-widget[data-table-from="${blockFrom}"]`,
    ) as HTMLElement | null
    if (!widget) return

    const input = widget.querySelector(
      `[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
    ) as HTMLInputElement | null
    if (!input) return

    focusElementWithoutScroll(input)
    input.setSelectionRange(input.value.length, input.value.length)
  })
}

export function updateTableCell(
  view: EditorView,
  { blockFrom, rowIndex, colIndex }: TableCellTarget,
  value: string,
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  const nextRows = block.rows.map((row) => [...row])
  if (!nextRows[rowIndex] || nextRows[rowIndex][colIndex] === undefined) return false
  nextRows[rowIndex][colIndex] = value

  view.dispatch({
    changes: { from: block.from, to: block.to, insert: formatTableMarkdown({ ...block, rows: nextRows }) },
    effects: setActiveTable.of(block.from),
    selection: EditorSelection.cursor(block.from),
  })
  return true
}

export function insertTableColumn(
  view: EditorView,
  { blockFrom, rowIndex, colIndex }: TableCellTarget,
  side: 'left' | 'right',
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  const insertIndex = side === 'left' ? colIndex : colIndex + 1
  const nextRows = block.rows.map((row) => {
    const nextRow = [...row]
    nextRow.splice(insertIndex, 0, '')
    return nextRow
  })
  const nextAlignments = [...block.alignments]
  nextAlignments.splice(insertIndex, 0, null)
  const nextBlock = { ...block, rows: nextRows, alignments: nextAlignments }

  applyTableBlockUpdate(view, block, nextBlock, EditorSelection.create([EditorSelection.cursor(block.from)]))
  focusTableCell(view, block.from, rowIndex, insertIndex)
  return true
}

export function removeTableColumn(
  view: EditorView,
  { blockFrom, rowIndex, colIndex }: TableCellTarget,
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  if (block.rows[0]?.length === 1) {
    applyTableBlockUpdate(view, block, null, EditorSelection.create([EditorSelection.cursor(block.from)]))
    return true
  }

  const nextRows = block.rows.map((row) => {
    const nextRow = [...row]
    nextRow.splice(colIndex, 1)
    return nextRow
  })
  const nextAlignments = [...block.alignments]
  nextAlignments.splice(colIndex, 1)
  const nextBlock = { ...block, rows: nextRows, alignments: nextAlignments }
  const nextColIndex = Math.max(0, Math.min(colIndex, nextRows[0].length - 1))

  applyTableBlockUpdate(view, block, nextBlock, EditorSelection.create([EditorSelection.cursor(block.from)]))
  focusTableCell(view, block.from, rowIndex, nextColIndex)
  return true
}

export function insertTableRow(
  view: EditorView,
  { blockFrom, rowIndex }: TableCellTarget,
  side: 'above' | 'below',
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  const insertIndex = side === 'above' ? rowIndex : rowIndex + 1
  const columnCount = block.rows[0]?.length ?? 0
  if (columnCount < 1) return false

  const nextRows = block.rows.map((row) => [...row])
  nextRows.splice(insertIndex, 0, Array(columnCount).fill(''))
  const nextBlock = { ...block, rows: nextRows }

  applyTableBlockUpdate(view, block, nextBlock, EditorSelection.create([EditorSelection.cursor(block.from)]))
  focusTableCell(view, block.from, insertIndex, 0)
  return true
}

export function removeTableRow(
  view: EditorView,
  { blockFrom, rowIndex, colIndex }: TableCellTarget,
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  if (rowIndex === 0 || block.rows.length === 1) {
    applyTableBlockUpdate(view, block, null, EditorSelection.create([EditorSelection.cursor(block.from)]))
    return true
  }

  const nextRows = block.rows.map((row) => [...row])
  nextRows.splice(rowIndex, 1)
  const nextBlock = { ...block, rows: nextRows }
  const nextRowIndex = Math.max(0, Math.min(rowIndex, nextRows.length - 1))
  const nextColIndex = Math.max(0, Math.min(colIndex, nextRows[nextRowIndex].length - 1))

  applyTableBlockUpdate(view, block, nextBlock, EditorSelection.create([EditorSelection.cursor(block.from)]))
  focusTableCell(view, block.from, nextRowIndex, nextColIndex)
  return true
}

export function removeTableColumnRange(
  view: EditorView,
  blockFrom: number,
  colStart: number,
  colEnd: number,
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  const removeCount = colEnd - colStart + 1
  if ((block.rows[0]?.length ?? 0) <= removeCount) {
    applyTableBlockUpdate(view, block, null, EditorSelection.create([EditorSelection.cursor(block.from)]))
    return true
  }

  const nextRows = block.rows.map((row) => {
    const nextRow = [...row]
    nextRow.splice(colStart, removeCount)
    return nextRow
  })
  const nextAlignments = [...block.alignments]
  nextAlignments.splice(colStart, removeCount)
  const nextBlock = { ...block, rows: nextRows, alignments: nextAlignments }

  applyTableBlockUpdate(view, block, nextBlock, EditorSelection.create([EditorSelection.cursor(block.from)]))
  focusTableCell(view, block.from, 0, Math.max(0, Math.min(colStart, nextRows[0].length - 1)))
  return true
}

export function removeTableRowRange(
  view: EditorView,
  blockFrom: number,
  rowStart: number,
  rowEnd: number,
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  const removeCount = rowEnd - rowStart + 1
  if (rowStart === 0 || block.rows.length <= removeCount) {
    applyTableBlockUpdate(view, block, null, EditorSelection.create([EditorSelection.cursor(block.from)]))
    return true
  }

  const nextRows = block.rows.map((row) => [...row])
  nextRows.splice(rowStart, removeCount)
  const nextBlock = { ...block, rows: nextRows }

  applyTableBlockUpdate(view, block, nextBlock, EditorSelection.create([EditorSelection.cursor(block.from)]))
  focusTableCell(view, block.from, Math.max(0, Math.min(rowStart, nextRows.length - 1)), 0)
  return true
}

export function clearTableCellRange(
  view: EditorView,
  blockFrom: number,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  const nextRows = block.rows.map((row) => [...row])
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      if (nextRows[row]?.[col] !== undefined) nextRows[row][col] = ''
    }
  }
  const nextBlock = { ...block, rows: nextRows }

  applyTableBlockUpdate(view, block, nextBlock, EditorSelection.create([EditorSelection.cursor(block.from)]))
  focusTableCell(view, block.from, rowStart, colStart)
  return true
}
