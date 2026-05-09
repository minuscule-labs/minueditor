import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType, keymap } from '@codemirror/view'
import { activeTableField, setActiveTable } from './state'
import {
  findTableBlocks,
  formatTableMarkdown,
  getAdjacentTableBlock,
  getTableBlockByStart,
  type TableBlock,
} from './model'

function updateTableCell(
  view: EditorView,
  blockFrom: number,
  rowIndex: number,
  colIndex: number,
  value: string,
): void {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return
  const nextRows = block.rows.map((row) => [...row])
  if (!nextRows[rowIndex] || nextRows[rowIndex][colIndex] === undefined) return
  nextRows[rowIndex][colIndex] = value
  const nextMarkdown = formatTableMarkdown({ ...block, rows: nextRows })

  view.dispatch({
    changes: { from: block.from, to: block.to, insert: nextMarkdown },
    effects: setActiveTable.of(block.from),
    selection: EditorSelection.cursor(block.from),
  })
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
    effects: setActiveTable.of(nextBlock ? block.from : null),
    selection: nextSelection,
    scrollIntoView: true,
  })
}

function focusTableInputAfterUpdate(
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
    focusTableInput(widget, rowIndex, colIndex)
  })
}

function insertTableColumnInWidget(
  view: EditorView,
  blockFrom: number,
  rowIndex: number,
  colIndex: number,
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

  applyTableBlockUpdate(
    view,
    block,
    nextBlock,
    EditorSelection.create([EditorSelection.cursor(block.from)]),
  )
  focusTableInputAfterUpdate(view, block.from, rowIndex, insertIndex)
  return true
}

function removeTableColumnInWidget(
  view: EditorView,
  blockFrom: number,
  rowIndex: number,
  colIndex: number,
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  if (block.rows[0]?.length === 1) {
    applyTableBlockUpdate(
      view,
      block,
      null,
      EditorSelection.create([EditorSelection.cursor(block.from)]),
    )
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

  applyTableBlockUpdate(
    view,
    block,
    nextBlock,
    EditorSelection.create([EditorSelection.cursor(block.from)]),
  )
  focusTableInputAfterUpdate(view, block.from, rowIndex, nextColIndex)
  return true
}

function removeTableRowInWidget(
  view: EditorView,
  blockFrom: number,
  rowIndex: number,
  colIndex: number,
): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  if (!block) return false

  if (rowIndex === 0 || block.rows.length === 1) {
    applyTableBlockUpdate(
      view,
      block,
      null,
      EditorSelection.create([EditorSelection.cursor(block.from)]),
    )
    return true
  }

  const nextRows = block.rows.map((row) => [...row])
  nextRows.splice(rowIndex, 1)
  const nextBlock = { ...block, rows: nextRows }
  const nextRowIndex = Math.max(0, Math.min(rowIndex, nextRows.length - 1))
  const nextColIndex = Math.max(0, Math.min(colIndex, nextRows[nextRowIndex].length - 1))

  applyTableBlockUpdate(
    view,
    block,
    nextBlock,
    EditorSelection.create([EditorSelection.cursor(block.from)]),
  )
  focusTableInputAfterUpdate(view, block.from, nextRowIndex, nextColIndex)
  return true
}

function insertTableRowInWidget(
  view: EditorView,
  blockFrom: number,
  rowIndex: number,
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

  applyTableBlockUpdate(
    view,
    block,
    nextBlock,
    EditorSelection.create([EditorSelection.cursor(block.from)]),
  )
  focusTableInputAfterUpdate(view, block.from, insertIndex, 0)
  return true
}

function activateTable(view: EditorView, block: TableBlock): boolean {
  view.dispatch({
    effects: setActiveTable.of(block.from),
    selection: EditorSelection.cursor(block.from),
    scrollIntoView: true,
  })

  requestAnimationFrame(() => {
    const widget = view.dom.querySelector(
      `.me-table-widget[data-table-from="${block.from}"]`,
    ) as HTMLElement | null
    if (!widget) return
    focusTableInput(widget, 0, 0)
  })

  return true
}

function deactivateTable(view: EditorView, blockFrom: number): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  view.dispatch({
    effects: setActiveTable.of(null),
    selection: EditorSelection.cursor(block?.to ?? blockFrom),
    scrollIntoView: true,
  })
  view.focus()
  return true
}

function focusTableInput(wrapper: HTMLElement, rowIndex: number, colIndex: number): boolean {
  const input = wrapper.querySelector(
    `[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
  ) as HTMLInputElement | null
  if (!input) return false
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
  return true
}

function clearTableSelection(wrapper: HTMLElement): void {
  delete wrapper.dataset.selectionAnchorRow
  delete wrapper.dataset.selectionAnchorCol
  delete wrapper.dataset.selectionFocusRow
  delete wrapper.dataset.selectionFocusCol
  for (const element of wrapper.querySelectorAll('.me-table-cell--selected')) {
    element.classList.remove('me-table-cell--selected')
    element.classList.remove('me-table-cell--selected-header')
  }
}

function tableSelectionBounds(wrapper: HTMLElement) {
  const anchorRow = wrapper.dataset.selectionAnchorRow
  const anchorCol = wrapper.dataset.selectionAnchorCol
  const focusRow = wrapper.dataset.selectionFocusRow
  const focusCol = wrapper.dataset.selectionFocusCol
  if (anchorRow == null || anchorCol == null || focusRow == null || focusCol == null) return null
  const rowStart = Math.min(Number(anchorRow), Number(focusRow))
  const rowEnd = Math.max(Number(anchorRow), Number(focusRow))
  const colStart = Math.min(Number(anchorCol), Number(focusCol))
  const colEnd = Math.max(Number(anchorCol), Number(focusCol))
  return { rowStart, rowEnd, colStart, colEnd }
}

function applyTableSelectionStyles(wrapper: HTMLElement): void {
  for (const element of wrapper.querySelectorAll('.me-table-cell--selected')) {
    element.classList.remove('me-table-cell--selected')
  }

  const bounds = tableSelectionBounds(wrapper)
  if (!bounds) return

  for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) {
    for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
      const input = wrapper.querySelector(
        `[data-row-index="${row}"][data-col-index="${col}"]`,
      ) as HTMLInputElement | null
      const cell = input?.closest('th, td') as HTMLElement | null
      if (!cell) continue
      cell.classList.add('me-table-cell--selected')
      if (row === 0) cell.classList.add('me-table-cell--selected-header')
    }
  }
}

function setTableSelection(
  wrapper: HTMLElement,
  anchorRow: number,
  anchorCol: number,
  focusRow: number,
  focusCol: number,
): void {
  wrapper.dataset.selectionAnchorRow = String(anchorRow)
  wrapper.dataset.selectionAnchorCol = String(anchorCol)
  wrapper.dataset.selectionFocusRow = String(focusRow)
  wrapper.dataset.selectionFocusCol = String(focusCol)
  applyTableSelectionStyles(wrapper)
}

function startTableSelection(wrapper: HTMLElement, rowIndex: number, colIndex: number): void {
  wrapper.dataset.selectionDragging = 'true'
  wrapper.dataset.dragAnchorRow = String(rowIndex)
  wrapper.dataset.dragAnchorCol = String(colIndex)
}

function updateTableSelection(wrapper: HTMLElement, rowIndex: number, colIndex: number): void {
  const anchorRow = wrapper.dataset.dragAnchorRow
  const anchorCol = wrapper.dataset.dragAnchorCol
  if (anchorRow == null || anchorCol == null) return
  setTableSelection(wrapper, Number(anchorRow), Number(anchorCol), rowIndex, colIndex)
}

function stopTableSelection(wrapper: HTMLElement): void {
  delete wrapper.dataset.selectionDragging
  delete wrapper.dataset.dragAnchorRow
  delete wrapper.dataset.dragAnchorCol
}

function deleteSelectedStructure(view: EditorView, blockFrom: number, wrapper: HTMLElement): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  const bounds = tableSelectionBounds(wrapper)
  if (!block || !bounds) return false

  const rowCount = block.rows.length
  const colCount = block.rows[0]?.length ?? 0

  if (bounds.colStart === 0 && bounds.colEnd === colCount - 1) {
    return removeTableRowRangeInWidget(view, blockFrom, bounds.rowStart, bounds.rowEnd)
  }

  if (bounds.rowStart === 0 && bounds.rowEnd === rowCount - 1) {
    return removeTableColumnRangeInWidget(view, blockFrom, bounds.colStart, bounds.colEnd)
  }

  return clearTableCellRangeInWidget(
    view,
    blockFrom,
    bounds.rowStart,
    bounds.rowEnd,
    bounds.colStart,
    bounds.colEnd,
  )
}

function removeTableColumnRangeInWidget(
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
  focusTableInputAfterUpdate(view, block.from, 0, Math.max(0, Math.min(colStart, nextRows[0].length - 1)))
  return true
}

function removeTableRowRangeInWidget(
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
  focusTableInputAfterUpdate(view, block.from, Math.max(0, Math.min(rowStart, nextRows.length - 1)), 0)
  return true
}

function clearTableCellRangeInWidget(
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
  focusTableInputAfterUpdate(view, block.from, rowStart, colStart)
  return true
}

class TableWidget extends WidgetType {
  constructor(
    readonly block: TableBlock,
    readonly isEditing: boolean,
  ) {
    super()
  }

  override eq(other: TableWidget): boolean {
    if (
      this.isEditing &&
      other.isEditing &&
      this.block.from === other.block.from &&
      this.block.rows.length === other.block.rows.length &&
      this.block.rows.every((row, index) => row.length === other.block.rows[index]?.length) &&
      this.block.alignments.length === other.block.alignments.length
    ) {
      return true
    }

    return (
      this.block.from === other.block.from &&
      this.block.to === other.block.to &&
      JSON.stringify(this.block.rows) === JSON.stringify(other.block.rows) &&
      JSON.stringify(this.block.alignments) === JSON.stringify(other.block.alignments) &&
      this.isEditing === other.isEditing
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = `me-table-widget${this.isEditing ? ' me-table-widget--editing' : ''}`
    wrapper.dataset.tableFrom = String(this.block.from)

    const scroller = document.createElement('div')
    scroller.className = 'me-table-scroller'

    const table = document.createElement('table')
    table.className = 'me-table-render'

    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    for (const [colIndex, cell] of this.block.rows[0].entries()) {
      const th = document.createElement('th')
      const align = this.block.alignments[colIndex]
      if (align) th.dataset.align = align
      if (this.isEditing) {
        th.appendChild(createTableInput(view, this.block.from, 0, colIndex, cell, wrapper))
      } else {
        th.textContent = cell || ' '
      }
      headerRow.appendChild(th)
    }
    thead.appendChild(headerRow)
    table.appendChild(thead)

    if (this.block.rows.length > 1) {
      const tbody = document.createElement('tbody')
      for (const [rowOffset, row] of this.block.rows.slice(1).entries()) {
        const tr = document.createElement('tr')
        for (const [colIndex, cell] of row.entries()) {
          const td = document.createElement('td')
          const align = this.block.alignments[colIndex]
          if (align) td.dataset.align = align
          if (this.isEditing) {
            td.appendChild(
              createTableInput(view, this.block.from, rowOffset + 1, colIndex, cell, wrapper),
            )
          } else {
            td.textContent = cell || ' '
          }
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      }
      table.appendChild(tbody)
    }

    scroller.appendChild(table)
    wrapper.appendChild(scroller)
    return wrapper
  }

  override ignoreEvent(): boolean {
    return false
  }
}

function createTableInput(
  view: EditorView,
  blockFrom: number,
  rowIndex: number,
  colIndex: number,
  value: string,
  wrapper: HTMLElement,
): HTMLInputElement {
  const input = document.createElement('input')
  input.className = 'me-table-input'
  input.type = 'text'
  input.value = value
  input.dataset.rowIndex = String(rowIndex)
  input.dataset.colIndex = String(colIndex)
  input.spellcheck = false
  input.addEventListener('mousedown', (event) => {
    event.stopPropagation()
    startTableSelection(wrapper, rowIndex, colIndex)
  })
  input.addEventListener('click', (event) => {
    event.stopPropagation()
    if (event.shiftKey) {
      const anchorRow = wrapper.dataset.selectionAnchorRow
      const anchorCol = wrapper.dataset.selectionAnchorCol
      if (anchorRow != null && anchorCol != null) {
        setTableSelection(wrapper, Number(anchorRow), Number(anchorCol), rowIndex, colIndex)
      } else {
        setTableSelection(wrapper, rowIndex, colIndex, rowIndex, colIndex)
      }
      return
    }
    clearTableSelection(wrapper)
    wrapper.dataset.selectionAnchorRow = String(rowIndex)
    wrapper.dataset.selectionAnchorCol = String(colIndex)
  })
  input.addEventListener('mouseenter', () => {
    if (wrapper.dataset.selectionDragging !== 'true') return
    updateTableSelection(wrapper, rowIndex, colIndex)
  })
  input.addEventListener('focus', () => {
    if (wrapper.dataset.selectionAnchorRow == null || wrapper.dataset.selectionAnchorCol == null) {
      wrapper.dataset.selectionAnchorRow = String(rowIndex)
      wrapper.dataset.selectionAnchorCol = String(colIndex)
    }
  })
  input.addEventListener('input', () => {
    updateTableCell(view, blockFrom, rowIndex, colIndex, input.value)
  })
  input.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      clearTableSelection(wrapper)
      deactivateTable(view, blockFrom)
      return
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && deleteSelectedStructure(view, blockFrom, wrapper)) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      let nextRow = rowIndex
      let nextCol = colIndex
      if (event.key === 'ArrowRight') nextCol += 1
      else if (event.key === 'ArrowLeft') nextCol -= 1
      else if (event.key === 'ArrowDown') nextRow += 1
      else if (event.key === 'ArrowUp') nextRow -= 1
      else nextRow = Number.NaN

      if (!Number.isNaN(nextRow)) {
        const block = getTableBlockByStart(view.state, blockFrom)
        if (!block) return
        nextRow = Math.max(0, Math.min(nextRow, block.rows.length - 1))
        nextCol = Math.max(0, Math.min(nextCol, block.rows[nextRow].length - 1))
        const anchorRow = Number(wrapper.dataset.selectionAnchorRow ?? rowIndex)
        const anchorCol = Number(wrapper.dataset.selectionAnchorCol ?? colIndex)
        setTableSelection(wrapper, anchorRow, anchorCol, nextRow, nextCol)
        focusTableInput(wrapper, nextRow, nextCol)
        event.preventDefault()
        return
      }
    }
    if (event.metaKey && event.ctrlKey && event.key === 'ArrowLeft') {
      event.preventDefault()
      insertTableColumnInWidget(view, blockFrom, rowIndex, colIndex, 'left')
      return
    }
    if (event.metaKey && event.ctrlKey && event.key === 'ArrowRight') {
      event.preventDefault()
      insertTableColumnInWidget(view, blockFrom, rowIndex, colIndex, 'right')
      return
    }
    if (event.metaKey && event.ctrlKey && event.key === 'ArrowUp') {
      event.preventDefault()
      insertTableRowInWidget(view, blockFrom, rowIndex, 'above')
      return
    }
    if (event.metaKey && event.ctrlKey && event.key === 'ArrowDown') {
      event.preventDefault()
      insertTableRowInWidget(view, blockFrom, rowIndex, 'below')
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Backspace') {
      event.preventDefault()
      removeTableColumnInWidget(view, blockFrom, rowIndex, colIndex)
      return
    }
    if (event.metaKey && event.ctrlKey && event.key === 'Backspace') {
      event.preventDefault()
      removeTableRowInWidget(view, blockFrom, rowIndex, colIndex)
      return
    }
    if (event.key === 'ArrowRight' && input.selectionStart === input.value.length) {
      if (focusTableInput(wrapper, rowIndex, colIndex + 1)) event.preventDefault()
      return
    }
    if (event.key === 'ArrowLeft' && input.selectionStart === 0) {
      if (focusTableInput(wrapper, rowIndex, colIndex - 1)) event.preventDefault()
      return
    }
    if (event.key === 'ArrowDown') {
      if (focusTableInput(wrapper, rowIndex + 1, colIndex)) event.preventDefault()
      return
    }
    if (event.key === 'ArrowUp') {
      if (focusTableInput(wrapper, rowIndex - 1, colIndex)) event.preventDefault()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey) {
        if (focusTableInput(wrapper, rowIndex, colIndex - 1)) return
        focusTableInput(wrapper, rowIndex - 1, Number.MAX_SAFE_INTEGER)
        return
      }
      if (focusTableInput(wrapper, rowIndex, colIndex + 1)) return
      focusTableInput(wrapper, rowIndex + 1, 0)
    }
  })
  return input
}

export function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: ReturnType<Decoration['range']>[] = []
  const activeFrom = state.field(activeTableField, false)

  for (const block of findTableBlocks(state)) {
    ranges.push(
      Decoration.replace({
        widget: new TableWidget(block, activeFrom === block.from),
        block: true,
        inclusive: true,
      }).range(block.from, block.to),
    )
  }

  return Decoration.set(ranges, true)
}

export const tableClickHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement | null
    const widget = target?.closest('.me-table-widget') as HTMLElement | null
    const activeFrom = view.state.field(activeTableField, false)

    if (!widget) {
      if (activeFrom != null) return deactivateTable(view, activeFrom)
      return false
    }

    if (target?.closest('.me-table-input')) return false

    const fromText = widget.dataset.tableFrom
    if (!fromText) return false
    const block = getTableBlockByStart(view.state, Number(fromText))
    if (!block) return false
    activateTable(view, block)
    event.preventDefault()
    return true
  },
  mouseup(_event, view) {
    for (const widget of view.dom.querySelectorAll('.me-table-widget')) {
      stopTableSelection(widget as HTMLElement)
    }
    return false
  },
})

export const tableArrowNavigation = Prec.high(
  keymap.of([
    {
      key: 'ArrowDown',
      run(view) {
        const selection = view.state.selection.main
        if (!selection.empty) return false
        const block = getAdjacentTableBlock(view.state, selection.head, 'down')
        if (!block) return false
        return activateTable(view, block)
      },
    },
    {
      key: 'ArrowUp',
      run(view) {
        const selection = view.state.selection.main
        if (!selection.empty) return false
        const block = getAdjacentTableBlock(view.state, selection.head, 'up')
        if (!block) return false
        return activateTable(view, block)
      },
    },
  ]),
)
